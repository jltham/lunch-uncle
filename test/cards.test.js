import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCards, pickMentionedPlaces, mapsUrl } from "../src/cards.js";

const places = [
  { id: "a", name: "Tiong Bahru Chicken Rice", rating: 4.2, distance_m: 320, open_now: true },
  { id: "b", name: "Berseh Food Centre - Jalan Besar", rating: 4.0, distance_m: 640, open_now: true },
  { id: "c", name: "Swee Choon", rating: 4.4, distance_m: 900, open_now: false },
];

test("pickMentionedPlaces keeps only places Uncle named, in the order he named them", () => {
  const reply = "Go Berseh Food Centre lah. Or if you want, Tiong Bahru Chicken Rice also can.";
  assert.deepEqual(
    pickMentionedPlaces(reply, places).map((p) => p.id),
    ["b", "a"],
  );
});

test("pickMentionedPlaces ignores case and drops duplicates from repeat searches", () => {
  const reply = "swee choon. Swee Choon!";
  assert.deepEqual(
    pickMentionedPlaces(reply, [...places, places[2]]).map((p) => p.id),
    ["c"],
  );
});

test("pickMentionedPlaces ignores spacing and punctuation differences", () => {
  const listed = [{ id: "y", name: "Yi Ping Hainanese Chicken Rice (Jalan Besar)" }];
  assert.deepEqual(
    pickMentionedPlaces("Go **YiPing Hainanese Chicken Rice** lah.", listed).map((p) => p.id),
    ["y"],
  );
});

test("pickMentionedPlaces returns nothing when no place is named", () => {
  assert.deepEqual(pickMentionedPlaces("Cannot decide? Go home lah.", places), []);
});

test("buildCards adds walk time and a maps link, and keeps the last good forecast", () => {
  const cards = buildCards("Tiong Bahru Chicken Rice, go now.", [
    { name: "find_lunch_places", result: { places } },
    { name: "get_rain_forecast", result: { area: "Kallang", forecast: "Cloudy", valid_period: "12 to 2 pm" } },
    { name: "get_rain_forecast", result: { error: "Forecast API returned 500" } },
  ]);

  assert.deepEqual(cards.places, [
    {
      name: "Tiong Bahru Chicken Rice",
      rating: 4.2,
      open_now: true,
      distance_m: 320,
      walk_min: 4,
      maps_url: mapsUrl("Tiong Bahru Chicken Rice", "a"),
    },
  ]);
  assert.deepEqual(cards.weather, { area: "Kallang", forecast: "Cloudy", valid_period: "12 to 2 pm" });
});

test("buildCards copes with failed searches and no forecast", () => {
  const cards = buildCards("Eh, cannot find.", [
    { name: "find_lunch_places", result: { error: "Places API returned 403" } },
  ]);
  assert.deepEqual(cards, { places: [], weather: null });
});

test("mapsUrl opens the exact place when it has an id", () => {
  const url = new URL(mapsUrl("Swee Choon", "ChIJ123"));
  assert.equal(url.searchParams.get("query"), "Swee Choon");
  assert.equal(url.searchParams.get("query_place_id"), "ChIJ123");
});
