/**
 * Turn the tool results from one turn into cards the chat page can show
 * under Uncle's reply: the places he actually named, and the rain forecast.
 *
 * Everything here is pure, so it is covered by tests.
 */

const MAX_CARDS = 3;
const MAX_EARLIER_PLACES = 30;
const WALK_METRES_PER_MINUTE = 80;
const MIN_LOOSE_WORDS = 3;

/**
 * Build the cards for one turn.
 *
 * reply is Uncle's final text. toolResults is a list of {name, result}
 * where result is the parsed object the tool returned to the model.
 * earlierPlaces are cards the page showed in earlier turns, so a place Uncle
 * brings up again without a new search still gets a card. This turn's
 * results come first, since their open/closed state is fresher.
 */
export function buildCards(reply, toolResults, earlierPlaces = []) {
  const searched = toolResults
    .filter((t) => t.name === "find_lunch_places" && Array.isArray(t.result?.places))
    .flatMap((t) => t.result.places)
    .concat(earlierPlaces);

  const forecast = toolResults
    .filter((t) => t.name === "get_rain_forecast" && t.result && !t.result.error)
    .at(-1)?.result;

  return {
    places: pickMentionedPlaces(reply, searched).map(toPlaceCard),
    weather: forecast
      ? { area: forecast.area, forecast: forecast.forecast, valid_period: forecast.valid_period }
      : null,
  };
}

/**
 * Keep only the places Uncle named in his reply, in the order he named them.
 *
 * The model sees up to ten results but recommends one or two, so showing
 * every search result would contradict him.
 */
export function pickMentionedPlaces(reply, places) {
  const text = squash(reply);
  const seen = new Set();
  const found = [];

  for (const place of places) {
    const key = place.id ?? place.name;
    if (seen.has(key)) continue;
    const at = mentionIndex(reply ?? "", text, place.name);
    if (at === -1) continue;
    seen.add(key);
    found.push({ place, at });
  }

  return found
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_CARDS)
    .map((f) => f.place);
}

/**
 * Where the place is first mentioned in the reply, or -1.
 * The position is counted in the squashed reply, so mentions found different
 * ways still sort in the order Uncle said them.
 */
function mentionIndex(reply, text, name) {
  for (const variant of nameVariants(name)) {
    const at = exactMentionIndex(text, variant);
    if (at !== -1) return at;
  }
  for (const variant of nameVariants(name)) {
    const at = looseMentionIndex(reply, variant);
    if (at !== -1) return at;
  }
  return -1;
}

/**
 * The name as listed, and without any Chinese, Japanese or Korean part,
 * since Uncle says "YiPing Hainanese Chicken Rice" for "藝品海南鸡饭 YiPing Hainanese Chicken Rice".
 */
function nameVariants(name) {
  const listed = (name ?? "").trim();
  const latin = listed
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return latin && latin !== listed ? [listed, latin] : [listed];
}

/**
 * Matches the full name, or the part before a dash, bar, bracket or comma,
 * since Uncle tends to say "Berseh Food Centre" for "Berseh Food Centre - Jalan Besar".
 */
function exactMentionIndex(text, name) {
  const full = squash(name);
  if (!full) return -1;
  const fullAt = text.indexOf(full);
  if (fullAt !== -1) return fullAt;
  const short = squash(name.split(/\s[-–|(]|[(,]/)[0]);
  if (short.length >= 4 && short !== full) return text.indexOf(short);
  return -1;
}

/**
 * Matches the name with words left out in the middle, since Uncle says
 * "North Bridge Road Food Centre" for "North Bridge Road Market & Food Centre".
 * The mention must start with the name's first word, end with its last word,
 * and be at least three words long, so a shared street name alone is not enough.
 */
function looseMentionIndex(reply, name) {
  const want = words(name);
  if (want.length < MIN_LOOSE_WORDS) return -1;
  const said = [...reply.matchAll(/[\p{L}\p{N}]+/gu)];

  for (let start = 0; start < said.length; start++) {
    if (said[start][0].toLowerCase() !== want[0]) continue;
    let next = 1;
    let count = 1;
    for (let i = start + 1; i < said.length && next < want.length; i++) {
      const word = said[i][0].toLowerCase();
      const found = want.indexOf(word, next);
      if (found === -1) break;
      next = found + 1;
      count++;
    }
    if (next === want.length && count >= MIN_LOOSE_WORDS) {
      return squash(reply.slice(0, said[start].index)).length;
    }
  }
  return -1;
}

function words(s) {
  return [...(s ?? "").toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)].map((m) => m[0]);
}

/**
 * Lower-case and drop everything but letters and digits, so "Yi Ping"
 * matches "YiPing" and "COZE+" matches "Coze".
 */
function squash(s) {
  return (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Keep only well-formed fields from the cards the page sends back.
 * They come from the browser, so nothing is trusted: the maps link is
 * always rebuilt here from the id and name.
 */
export function cleanEarlierPlaces(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((p) => p && typeof p === "object" && typeof p.name === "string" && p.name.trim())
    .slice(0, MAX_EARLIER_PLACES)
    .map((p) => ({
      id: typeof p.id === "string" && /^[\w-]{1,200}$/.test(p.id) ? p.id : null,
      name: p.name.trim().slice(0, 200),
      rating: Number.isFinite(p.rating) ? p.rating : null,
      distance_m: Number.isFinite(p.distance_m) ? p.distance_m : null,
      open_now: typeof p.open_now === "boolean" ? p.open_now : null,
    }));
}

function toPlaceCard(place) {
  return {
    id: place.id ?? null,
    name: place.name,
    rating: place.rating,
    open_now: place.open_now,
    distance_m: place.distance_m,
    walk_min:
      typeof place.distance_m === "number"
        ? Math.max(1, Math.ceil(place.distance_m / WALK_METRES_PER_MINUTE))
        : null,
    maps_url: mapsUrl(place.name, place.id),
  };
}

/**
 * Google Maps link that opens the exact place when we have its id.
 */
export function mapsUrl(name, placeId) {
  const params = new URLSearchParams({ api: "1", query: name });
  if (placeId) params.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${params}`;
}
