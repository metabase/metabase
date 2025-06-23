import { nanoid } from "@reduxjs/toolkit";

import api from "metabase/lib/api";

import { type AIStreamingConfig, processChatResponse } from "./process-stream";
import type { JSONValue } from "./types";

// keep track of inflight requests so that can be cancelled programmitcally from other
// places in the app w/o passing references to the abort controller directly
export const inflightAiStreamingRequests = new Map<
  string,
  { abortController: AbortController }
>();

export const getInflightRequestsForUrl = (url: string) => {
  return [...inflightAiStreamingRequests.entries()]
    .filter(([reqId]) => reqId.startsWith(`${url}-`))
    .map(([_reqId, reqInfo]) => reqInfo);
};

/**
 * Performs a streaming AI query by sending a POST request and processing the server-sent events response.
 * @returns A promise that resolves to the processed chat response stream
 */
export async function aiStreamingQuery(
  req: {
    url: string;
    signal?: AbortSignal | null | undefined;
    body: JSONValue;
  },
  config: AIStreamingConfig = {},
) {
  const reqId = `${req.url}-${nanoid()}`;

  try {
    const abortController = new AbortController();

    if (req.signal) {
      req.signal.addEventListener("abort", () => {
        abortController.abort(req.signal?.reason);
        inflightAiStreamingRequests.delete(reqId);
      });
    }
    inflightAiStreamingRequests.set(reqId, { abortController });

    const response = await fetch(req.url, {
      method: "POST",
      headers: {
        ...api.getClientHeaders(),
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      signal: abortController.signal,
      body: JSON.stringify(req.body),
    });

    if (response && !response.ok) {
      throw response;
    }

    if (!response || !response.body) {
      throw new Error("No Response");
    }

    return processChatResponse(response.body, config);
  } finally {
    inflightAiStreamingRequests.delete(reqId);
  }
}
