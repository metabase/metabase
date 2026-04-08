import { isMatching } from "ts-pattern";

import type {
  SSEEvent,
  ToolInputAvailableEvent,
  ToolOutputAvailableEvent,
} from "metabase/lib/ai-sdk";
import { isDataEvent, parseSSEStream } from "metabase/lib/ai-sdk";
import type { MetabotHistory } from "metabase-types/api";

import { type KnownDataPart, knownDataPartTypes } from "./schemas";

type ToolCall =
  | { toolCallId: string; toolName: string; state: "call" }
  | { toolCallId: string; toolName: string; state: "result"; value: unknown };

type DataPart = { type: string; data: unknown };

export type AIStreamingConfig = {
  onTextPart?: (delta: string) => void;
  onDataPart?: (part: KnownDataPart) => void;
  onToolCallPart?: (event: ToolInputAvailableEvent) => void;
  onToolResultPart?: (event: ToolOutputAvailableEvent) => void;
  onError?: (errorText: string) => void;
};

export interface ProcessedChatResponse {
  aborted: boolean;
  toolCalls: ToolCall[];
  history: MetabotHistory;
  data: DataPart[];
}

/**
 * Processes an SSE stream that follows our AI response protocol and notifies
 * the appropriate handlers as events arrive.
 *
 * This function does not error on aborted requests and will return whatever
 * values that it has received so far as a result.
 */
export async function processChatResponse(
  stream: ReadableStream<Uint8Array>,
  config: AIStreamingConfig,
): Promise<ProcessedChatResponse> {
  const result: ProcessedChatResponse = {
    aborted: false,
    toolCalls: [],
    history: [],
    data: [],
  };

  try {
    for await (const event of parseSSEStream(stream)) {
      processEvent(event, result, config);
    }
  } catch (err) {
    if (isMatching({ name: "AbortError" }, err)) {
      result.aborted = true;
    } else {
      throw err;
    }
  }

  return result;
}

function processEvent(
  event: SSEEvent,
  result: ProcessedChatResponse,
  config: AIStreamingConfig,
) {
  switch (event.type) {
    case "text-delta": {
      config.onTextPart?.(event.delta);
      const lastEntry = result.history[result.history.length - 1];
      if (
        lastEntry &&
        lastEntry.role === "assistant" &&
        "content" in lastEntry
      ) {
        lastEntry.content += event.delta;
      } else {
        result.history.push({ role: "assistant", content: event.delta });
      }
      break;
    }

    case "tool-input-available": {
      config.onToolCallPart?.(event);
      result.toolCalls.push({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        state: "call",
      });
      result.history.push({
        role: "assistant",
        tool_calls: [
          {
            id: event.toolCallId,
            name: event.toolName,
            arguments:
              typeof event.input === "string"
                ? event.input
                : JSON.stringify(event.input),
          },
        ],
      });
      break;
    }

    case "tool-output-available": {
      const index = result.toolCalls.findIndex(
        (tc) => tc.toolCallId === event.toolCallId,
      );
      if (index === -1) {
        throw new Error(
          "Tool Results must be preceded by the tool call with the same toolCallId",
        );
      }
      config.onToolResultPart?.(event);
      result.toolCalls[index] = {
        ...result.toolCalls[index],
        state: "result",
        value: event.output,
      };
      result.history.push({
        role: "tool",
        content: event.output,
        tool_call_id: event.toolCallId,
      });
      break;
    }

    case "error": {
      config.onError?.(event.errorText);
      break;
    }

    default: {
      // "data-*" event type
      if (isDataEvent(event)) {
        const dataPart: DataPart = { type: event.type, data: event.data };
        result.data.push(dataPart);
        if (knownDataPartTypes.includes(event.type)) {
          config.onDataPart?.(dataPart as KnownDataPart);
        } else {
          console.warn("Skipping unknown data part:", dataPart);
        }
      }

      // NOTE: Lifecycle events (start, start-step, finish-step, text-start,
      // text-end, tool-input-start, tool-input-delta, finish) are currently ignored.
      break;
    }
  }
}
