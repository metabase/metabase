import http from "node:http";

let server: http.Server | null = null;

/**
 * Build a raw Anthropic SSE response that streams the given text as a single
 * content_block_delta and then closes the message cleanly.
 *
 * The format follows the Anthropic /v1/messages streaming specification:
 * https://docs.anthropic.com/en/api/messages-streaming
 */
function buildAnthropicSSE(text: string): string {
  const lines = [
    "event: message_start",
    `data: ${JSON.stringify({ type: "message_start", message: { id: "msg_mock", type: "message", role: "assistant", content: [], model: "claude-haiku-4-5", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}`,
    "",
    "event: content_block_start",
    `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}`,
    "",
    "event: content_block_delta",
    `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}`,
    "",
    "event: content_block_stop",
    `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`,
    "",
    "event: message_delta",
    `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 8 } })}`,
    "",
    "event: message_stop",
    `data: ${JSON.stringify({ type: "message_stop" })}`,
    "",
  ];
  return lines.join("\n");
}

/**
 * Start a mock server that impersonates the Anthropic Messages API.
 *
 * Every POST to /v1/messages responds with a valid SSE stream containing
 * the given `responseText`.  The server listens on `port`.
 *
 * Call `stopMockLlmServer` to tear it down.
 */
export function startMockLlmServer({
  port,
  responseText,
}: {
  port: number;
  responseText: string;
}): Promise<null> {
  return new Promise((resolve, reject) => {
    if (server) {
      server.close();
      server = null;
    }

    server = http.createServer((_req, res) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.end(buildAnthropicSSE(responseText));
    });

    server.on("error", reject);
    server.listen(port, () => resolve(null));
  });
}

/**
 * Stop the mock LLM server started by `startMockLlmServer`.
 */
export function stopMockLlmServer(): Promise<null> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve(null));
      server = null;
    } else {
      resolve(null);
    }
  });
}
