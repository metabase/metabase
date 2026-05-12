import api from "metabase/api/legacy-client";

import type {
  OptimizerStreamError,
  OptimizerStreamEvent,
  Proposal,
} from "../types";

const OPTIMIZE_PATH = (id: number | string) =>
  `/api/ee/transform-optimizer/${id}/optimize`;

type OptimizeRequest = {
  transformId: number | string;
  analyze?: boolean;
  signal: AbortSignal;
  onEvent: (event: OptimizerStreamEvent) => void;
};

/**
 * Open an SSE stream against the optimizer endpoint and dispatch parsed
 * `summary` / `proposal` / `done` / `error` events to `onEvent`. Resolves
 * when the stream closes cleanly (after `done` or `error`); rejects on
 * network/abort failure.
 */
export async function runOptimizerStream({
  transformId,
  analyze = false,
  signal,
  onEvent,
}: OptimizeRequest): Promise<void> {
  const response = await fetch(`${api.basename}${OPTIMIZE_PATH(transformId)}`, {
    method: "POST",
    headers: {
      ...api.getClientHeaders(),
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({ analyze }),
  });

  if (!response.ok) {
    const error = await readErrorResponse(response);
    onEvent({ event: "error", data: error });
    return;
  }

  if (!response.body) {
    onEvent({
      event: "error",
      data: { message: "Empty response body", retryable: true },
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = drainSseBuffer(buffer, onEvent);
    }
    // flush any tail bytes
    buffer += decoder.decode();
    drainSseBuffer(buffer, onEvent, /* flushTail */ true);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return;
    }
    onEvent({
      event: "error",
      data: {
        message: (err as Error)?.message ?? "Stream interrupted",
        retryable: true,
      },
    });
  }
}

/**
 * SSE framing: events are separated by a blank line; each frame has
 * `event: <name>` and `data: <json>` lines. We process complete frames
 * and leave the trailing partial frame in the buffer for the next read.
 */
function drainSseBuffer(
  buffer: string,
  onEvent: (event: OptimizerStreamEvent) => void,
  flushTail = false,
): string {
  const FRAME_SEP = /\r?\n\r?\n/;
  const parts = buffer.split(FRAME_SEP);
  const remainder = flushTail ? "" : (parts.pop() ?? "");

  for (const frame of parts) {
    const parsed = parseSseFrame(frame);
    if (parsed) {
      onEvent(parsed);
    }
  }
  return remainder;
}

function parseSseFrame(frame: string): OptimizerStreamEvent | null {
  let event: string | null = null;
  const dataLines: string[] = [];

  for (const rawLine of frame.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) {
      continue;
    }
    const sepIdx = line.indexOf(":");
    if (sepIdx === -1) {
      continue;
    }
    const field = line.slice(0, sepIdx);
    // SSE spec: an optional single space after the colon is stripped.
    const value = line.slice(sepIdx + 1).replace(/^ /, "");
    if (field === "event") {
      event = value;
    } else if (field === "data") {
      dataLines.push(value);
    }
  }
  if (!event || dataLines.length === 0) {
    return null;
  }
  const dataText = dataLines.join("\n");
  let data: unknown;
  try {
    data = JSON.parse(dataText);
  } catch {
    return null;
  }
  switch (event) {
    case "summary":
      if (isSummary(data)) {
        return { event: "summary", data };
      }
      break;
    case "proposal":
      if (isProposal(data)) {
        return { event: "proposal", data };
      }
      break;
    case "done":
      if (isDone(data)) {
        return { event: "done", data };
      }
      break;
    case "error":
      if (isError(data)) {
        return { event: "error", data };
      }
      break;
  }
  return null;
}

async function readErrorResponse(
  response: Response,
): Promise<OptimizerStreamError> {
  const retryable = response.status >= 500;
  try {
    const json = await response.json();
    if (json && typeof json === "object" && typeof json.message === "string") {
      return { message: json.message, retryable };
    }
    if (typeof json === "string") {
      return { message: json, retryable };
    }
  } catch {
    // fall through to status-based default
  }
  return {
    message: `Optimizer request failed (HTTP ${response.status})`,
    retryable,
  };
}

function isSummary(data: unknown): data is { text: string } {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).text === "string"
  );
}

function isDone(data: unknown): data is { optimization_degree: number } {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).optimization_degree === "number"
  );
}

function isError(data: unknown): data is OptimizerStreamError {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).message === "string"
  );
}

function isProposal(data: unknown): data is Proposal {
  if (!data || typeof data !== "object") {
    return false;
  }
  const p = data as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.kind === "string" &&
    typeof p.severity === "string" &&
    typeof p.rationale === "string" &&
    typeof p.expected_speedup === "string" &&
    Array.isArray(p.depends_on)
    // `ddl_statement` is optional (only present for kind="index") and
    // `body` is optional (only present for kind="rewrite"|"precompute").
    // We deliberately don't require either here — older responses
    // emitted `ddl_statements: []` (plural) and rejecting on its absence
    // would silently drop every modern proposal. ProposalCard tolerates
    // both fields being absent.
  );
}
