import { type AIStreamingConfig, processChatResponse } from "./process-stream";
import type { JSONValue } from "./types";

export async function aiStreamingQuery(
  req: {
    url: string;
    // TODO: should we introduce a default signal / should this be a controller... we need some way to abort requests programmatically
    signal?: AbortSignal | null | undefined;
    body: JSONValue;
  },
  config: AIStreamingConfig = {},
) {
  const response = await fetch(req.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: req.signal,
    body: JSON.stringify(req.body),
  });

  if (!response || !response.body) {
    throw new Error("No Response");
  }

  return processChatResponse(response.body, config);
}
