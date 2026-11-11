import { test } from "node:test";
import assert from "node:assert/strict";
import { llmConfigError } from "../src/loop.js";

test("llmConfigError explains a TODO base URL", () => {
  assert.match(llmConfigError("TODO", "some-model"), /LLM_BASE_URL is not set.*README step 4/);
});

test("llmConfigError explains a TODO model", () => {
  assert.match(llmConfigError("https://example.com/v1", "TODO"), /LLM_MODEL is not set.*README step 4/);
});

test("llmConfigError rejects a base URL that already includes /chat/completions", () => {
  assert.match(
    llmConfigError("https://example.com/v1/chat/completions", "some-model"),
    /LLM_BASE_URL should end before \/chat\/completions/,
  );
});

test("llmConfigError accepts a filled-in config", () => {
  assert.equal(llmConfigError("https://example.com/v1", "some-model"), null);
});
