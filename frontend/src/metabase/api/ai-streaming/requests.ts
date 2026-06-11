import { nanoid } from "@reduxjs/toolkit";

import { api } from "metabase/api/client";
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

    const response = await api.fetch({
      method: "POST",
      url: req.url,
      body: req.body,
      headers: { Accept: "text/event-stream" },
      signal: abortController.signal,
    });

    if (!response.ok) {
      // Mirror the legacy client's error shape (`{ status, data }`) so streaming
      // and non-streaming callers handle failures the same way. A non-JSON or
      // empty error body leaves `data` undefined; the status still identifies it.
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        // ignore json parse errors
      }

      throw { status: response.status, data };
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
