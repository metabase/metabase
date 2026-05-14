// SSE consumer for /api/slides/:id/agent. fetch() + manual parse so we can
// stay on the same auth & cookie pipeline as the rest of the app (EventSource
// won't send X-Metabase-Session and can't POST a body).

import type { Slide } from "./types";

export type AgentEvent =
  | { type: "thinking"; iteration: number }
  | { type: "assistant"; text: string }
  | {
      type: "tool_call";
      id: string;
      tool: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      id: string;
      tool: string;
      result: Record<string, unknown>;
    }
  | {
      type: "outline";
      outline: {
        title: string;
        slides: { layout: string; title: string; intent: string }[];
      };
    }
  | { type: "slide_written"; index: number; slide: Slide }
  | { type: "done"; latency_ms: number }
  | { type: "saved"; deck_id: number }
  | { type: "error"; message: string }
  | { type: "end" };

export interface AgentStreamArgs {
  deckId: number;
  prompt: string;
  dashboardId?: number | null;
  cardIds?: number[];
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
}

const decodeSseChunk = (buffer: string): { events: string[]; rest: string } => {
  const parts = buffer.split("\n\n");
  return { events: parts.slice(0, -1), rest: parts[parts.length - 1] };
};

const parseEvent = (chunk: string): AgentEvent | null => {
  // Each event has at least: `event: <type>\ndata: <json>`
  let dataLine: string | null = null;
  for (const line of chunk.split("\n")) {
    if (line.startsWith("data:")) {
      dataLine = line.slice(5).trim();
    }
  }
  if (!dataLine) {
    return null;
  }
  try {
    return JSON.parse(dataLine) as AgentEvent;
  } catch {
    return null;
  }
};

export const runAgentStream = async ({
  deckId,
  prompt,
  dashboardId,
  cardIds,
  signal,
  onEvent,
}: AgentStreamArgs) => {
  const res = await fetch(`/api/slides/${deckId}/agent`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    signal,
    body: JSON.stringify({
      prompt,
      dashboard_id: dashboardId ?? undefined,
      card_ids: cardIds ?? undefined,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Agent stream failed (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = decodeSseChunk(buffer);
    buffer = rest;
    for (const raw of events) {
      const event = parseEvent(raw);
      if (event) {
        onEvent(event);
      }
    }
  }
};
