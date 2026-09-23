// Ask Metabot one question over the same endpoint the web UI uses and print the turn compactly.
// Usage: demo/chat.sh [--conversation <id>] "<question>"
// Exits 0 only when the turn finishes with "stop".
import { readFileSync, writeFileSync } from "node:fs";

const dir = import.meta.dir;
const env = Object.fromEntries(
  readFileSync(`${dir}/../.env`, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const base = process.env.MB_URL ?? env.MB_URL ?? "http://localhost:3000";
const apiKey = process.env.MB_API_KEY ?? env.MB_API_KEY;

const args = process.argv.slice(2);
const convIdx = args.indexOf("--conversation");
const continuing = convIdx >= 0;
const conversationId = continuing ? args.splice(convIdx, 2)[1] : crypto.randomUUID();
const question = args.join(" ").trim();
if (!question || !conversationId) {
  console.error('usage: demo/chat.sh [--conversation <id>] "<question>"');
  process.exit(2);
}

// The server rejects a follow-up unless parent_message_id is the conversation's last assistant message,
// so remember it per conversation.
const statePath = `${dir}/.chat-state.json`;
let state: Record<string, string> = {};
try {
  state = JSON.parse(readFileSync(statePath, "utf8"));
} catch {}
if (continuing && !state[conversationId]) {
  console.error(`no saved turn for ${conversationId}; only conversations started by this script can be continued`);
  process.exit(2);
}

const t0 = performance.now();
const ts = () => `[${((performance.now() - t0) / 1000).toFixed(1).padStart(5)}s]`;
const oneLine = (v: unknown, n: number) => {
  const s = (typeof v === "string" ? v : JSON.stringify(v)) ?? "";
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n) + "..." : flat;
};

console.log(`conversation ${conversationId}${continuing ? "" : " (new)"}`);
console.log(`> ${question}`);

const res = await fetch(`${base}/api/metabot/agent-streaming`, {
  method: "POST",
  // gzip makes bun throw ZlibError when the server cuts an errored stream short
  headers: { "content-type": "application/json", "x-api-key": apiKey, "accept-encoding": "identity" },
  body: JSON.stringify({
    message: question,
    conversation_id: conversationId,
    ...(continuing ? { parent_message_id: state[conversationId] } : {}),
    user_message_id: crypto.randomUUID(),
    assistant_message_id: crypto.randomUUID(),
    // what the web UI sends for an admin with no page context (frontend/src/metabase/metabot/context.tsx)
    context: {
      user_is_viewing: [],
      current_time_with_timezone: new Date().toISOString(),
      capabilities: ["permission:save_questions", "permission:write_sql_queries"],
    },
  }),
});
if (!res.ok || !res.body) {
  console.log(`HTTP ${res.status}: ${oneLine(await res.text(), 500)}`);
  process.exit(1);
}

const names: Record<string, string> = {};
const tools: string[] = [];
let answer = "";
let finish = "none";
let usage = "";
let buf = "";
const decoder = new TextDecoder();

function handle(e: any) {
  switch (e.type) {
    case "start":
      state[conversationId] = e.messageId;
      writeFileSync(statePath, JSON.stringify(state, null, 2));
      break;
    case "tool-input-available":
      names[e.toolCallId] = e.toolName;
      tools.push(e.toolName);
      console.log(`${ts()} call ${e.toolName} ${oneLine(e.input, 160)}`);
      break;
    case "tool-output-available":
      console.log(`${ts()}   -> ${names[e.toolCallId] ?? "?"}: ${oneLine(e.output, 200)}`);
      break;
    case "tool-output-error":
      console.log(`${ts()}   !! ${names[e.toolCallId] ?? "?"} error: ${oneLine(e.errorText, 200)}`);
      break;
    case "text-delta":
      answer += e.delta;
      break;
    case "data-conversation-title":
      console.log(`${ts()} title: ${oneLine(e.data, 100)}`);
      break;
    case "error":
      console.log(`${ts()} stream error: ${oneLine(e.errorText ?? e.error, 300)}`);
      break;
    case "finish": {
      finish = e.finishReason ?? "unknown";
      const u = e.messageMetadata?.usage;
      if (u) usage = ` tokens in/out ${u.inputTokens}/${u.outputTokens}`;
      break;
    }
  }
}

try {
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        handle(JSON.parse(data));
      } catch {
        console.log(`${ts()} unparsed: ${oneLine(data, 200)}`);
      }
    }
  }
} catch (err) {
  console.log(`${ts()} stream broke: ${oneLine(String(err), 200)}`);
}

console.log(`answer: ${answer.trim() || "(empty)"}`);
console.log(
  `finish ${finish} | ${((performance.now() - t0) / 1000).toFixed(1)}s | tools ${tools.join(" > ") || "none"} |${usage} | conversation ${conversationId}`,
);
process.exit(finish === "stop" ? 0 : 1);
