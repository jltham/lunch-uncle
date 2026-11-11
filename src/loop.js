import { buildSystemPrompt } from "./prompt.js";
import { toolDefinitions, executeTool } from "./tools.js";
import { buildCards } from "./cards.js";

// TODO: set the base URL and model for your OpenAI-compatible provider.
const LLM_BASE_URL = "https://opencode.ai/inference/go/openai/v1";
const LLM_MODEL = "glm-5.3-flash";

const LLM_TIMEOUT_MS = 20_000;
const MAX_ROUNDS = 8;

/**
 * Explain what is wrong with the LLM settings, or return null if they look usable.
 */
export function llmConfigError(baseUrl, model) {
  if (!baseUrl || baseUrl === "TODO") {
    return "LLM_BASE_URL is not set in src/loop.js. See README step 4.";
  }
  if (!model || model === "TODO") {
    return "LLM_MODEL is not set in src/loop.js. See README step 4.";
  }
  if (/\/chat\/completions\/?$/.test(baseUrl)) {
    return "LLM_BASE_URL should end before /chat/completions, which callModel adds itself.";
  }
  return null;
}

/**
 * Run the agentic loop for one user turn.
 *
 * Returns {reply, places, weather}: Uncle's text plus the cards built from
 * this turn's tool results (see cards.js).
 *
 * history is the prior conversation as OpenAI-style {role, content} messages.
 */
export async function runLoop(history, message, env) {
  const configError = llmConfigError(LLM_BASE_URL, LLM_MODEL);
  if (configError) {
    throw new Error(configError);
  }

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...history,
    { role: "user", content: message },
  ];

  // One session id per turn, shared by every model call in this loop run,
  // so the OpenCode Go endpoint can route and cache consistently.
  const sessionId = crypto.randomUUID();

  // Parsed tool results from this turn, for the cards under the reply.
  const toolResults = [];

  let round = 0;
  while (round < MAX_ROUNDS) {
    const assistant = await callModel(messages, env, sessionId);
    messages.push(assistant);

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const reply = assistant.content ?? "";
      return { reply, ...buildCards(reply, toolResults) };
    }

    for (const call of toolCalls) {
      const args = parseArgs(call.function.arguments);
      console.log(`round ${round}: ${call.function.name}`, args);
      const result = await executeTool(call.function.name, args, env);
      toolResults.push({ name: call.function.name, result: parseArgs(result) });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
    round++;
  }

  return {
    reply: "Uncle tried too many times already. Ask something simpler.",
    places: [],
    weather: null,
  };
}

async function callModel(messages, env, sessionId) {
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENCODE_API_KEY}`,
      "x-opencode-session": sessionId,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      tools: toolDefinitions,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`LLM returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.choices[0].message;
}

function parseArgs(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
