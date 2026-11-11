/**
 * Turn the tool results from one turn into cards the chat page can show
 * under Uncle's reply: the places he actually named, and the rain forecast.
 *
 * Everything here is pure, so it is covered by tests.
 */

const MAX_CARDS = 3;
const WALK_METRES_PER_MINUTE = 80;

/**
 * Build the cards for one turn.
 *
 * reply is Uncle's final text. toolResults is a list of {name, result}
 * where result is the parsed object the tool returned to the model.
 */
export function buildCards(reply, toolResults) {
  const searched = toolResults
    .filter((t) => t.name === "find_lunch_places" && Array.isArray(t.result?.places))
    .flatMap((t) => t.result.places);

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
    const at = mentionIndex(text, place.name);
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
 * Where the place is first mentioned in the squashed reply, or -1.
 * Matches the full name, or the part before a dash, bar, bracket or comma,
 * since Uncle tends to say "Berseh Food Centre" for "Berseh Food Centre - Jalan Besar".
 */
function mentionIndex(text, name) {
  const full = squash(name);
  if (!full) return -1;
  const fullAt = text.indexOf(full);
  if (fullAt !== -1) return fullAt;
  const short = squash((name ?? "").split(/\s[-–|(]|[(,]/)[0]);
  if (short.length >= 4 && short !== full) return text.indexOf(short);
  return -1;
}

/**
 * Lower-case and drop everything but letters and digits, so "Yi Ping"
 * matches "YiPing" and "COZE+" matches "Coze".
 */
function squash(s) {
  return (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function toPlaceCard(place) {
  return {
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
