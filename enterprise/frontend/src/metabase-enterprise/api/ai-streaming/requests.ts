import { nanoid } from "@reduxjs/toolkit";

import api from "metabase/lib/api";
import type { JSONValue } from "metabase-types/api";

import { type AIStreamingConfig, processChatResponse } from "./process-stream";

// keep track of inflight requests so that can be cancelled programmitcally from other
// places in the app w/o passing references to the abort controller directly
export const inflightAiStreamingRequests = new Map<
  string,
  {
    sourceId?: string;
    abortController: AbortController;
  }
>();

export const findMatchingInflightAiStreamingRequests = (
  url: string,
  sourceId?: string,
) => {
  return [...inflightAiStreamingRequests.entries()]
    .filter(
      ([reqId, req]) =>
        reqId.startsWith(`${url}-`) && (!sourceId || sourceId === req.sourceId),
    )
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
    sourceId?: string;
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
    inflightAiStreamingRequests.set(reqId, {
      sourceId: req.sourceId,
      abortController,
    });

    // The basename is needed to work within the Embedding SDK
    const response = await fetch(`${api.basename}${req.url}`, {
      method: "POST",
      headers: {
        ...api.getClientHeaders(),
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      signal: abortController.signal,
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response");
    }

    // without the await here the finally clause will run before
    // processChatResponse has resolved causing the chat response
    // to continue to be processed even if the provided abort
    // signal has been aborted
    return await processChatResponse(response.body, config);
  } finally {
    inflightAiStreamingRequests.delete(reqId);
  }
}
