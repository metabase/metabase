import { isMatching } from "ts-pattern";

import type { MetabotHistory } from "metabase-types/api";

import {
  type KnownDataPart,
  dataEventSchema,
  knownDataPartTypes,
  toolInputAvailableSchema,
  toolOutputAvailableSchema,
  toolOutputErrorSchema,
} from "./schemas";
import { parseSSEStream } from "./sse-stream";
import type {
  FinishReason,
  MessageMetadata,
  SSEEvent,
  ToolInputAvailableEvent,
  ToolInputStartEvent,
  ToolOutputAvailableEvent,
  ToolOutputErrorEvent,
} from "./sse-types";
import { isDataEvent } from "./sse-types";

type ToolCall =
  | { toolCallId: string; toolName: string; state: "call" }
  | {
      toolCallId: string;
      toolName: string;
      state: "result";
      value: unknown;
      error?: string;
    };

type DataPart = { type: string; data: unknown };

export type AIStreamingConfig = {
  onTextPart?: (delta: string) => void;
  onDataPart?: (part: KnownDataPart) => void;
  onToolInputStart?: (event: ToolInputStartEvent) => void;
  onToolInputAvailable?: (event: ToolInputAvailableEvent) => void;
  onToolResultPart?: (event: ToolOutputAvailableEvent) => void;
  onToolErrorPart?: (event: ToolOutputErrorEvent) => void;
  onError?: (errorText: string) => void;
  onMessageMetadata?: (metadata: MessageMetadata) => void;
};

export interface ProcessedChatResponse {
  aborted: boolean;
  toolCalls: ToolCall[];
  history: MetabotHistory;
  data: DataPart[];
  messageMetadata?: MessageMetadata;
  finishReason?: FinishReason;
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

    case "tool-input-start": {
      config.onToolInputStart?.(event);
      break;
    }

    case "tool-input-available": {
      toolInputAvailableSchema.validateSync(event, { strict: true });
      config.onToolInputAvailable?.(event);
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
      toolOutputAvailableSchema.validateSync(event, { strict: true });
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

    case "tool-output-error": {
      toolOutputErrorSchema.validateSync(event, { strict: true });
      const index = result.toolCalls.findIndex(
        (tc) => tc.toolCallId === event.toolCallId,
      );
      if (index === -1) {
        throw new Error(
          "Tool Results must be preceded by the tool call with the same toolCallId",
        );
      }
      config.onToolErrorPart?.(event);
      result.toolCalls[index] = {
        ...result.toolCalls[index],
        state: "result",
        value: undefined,
        error: event.errorText,
      };
      result.history.push({
        role: "tool",
        content: event.errorText,
        tool_call_id: event.toolCallId,
      });
      break;
    }

    case "error": {
      config.onError?.(event.errorText);
      break;
    }

    case "message-metadata": {
      result.messageMetadata = event.messageMetadata;
      config.onMessageMetadata?.(event.messageMetadata);
      break;
    }

    case "finish": {
      if (event.finishReason) {
        result.finishReason = event.finishReason;
      }
      // finish chunk's usage supersedes any prior mid-stream message-metadata snapshot
      if (event.messageMetadata) {
        result.messageMetadata = event.messageMetadata;
        config.onMessageMetadata?.(event.messageMetadata);
      }
      break;
    }

    default: {
      // "data-*" event type
      if (isDataEvent(event)) {
        dataEventSchema.validateSync(event, { strict: true });
        const dataPart: DataPart = { type: event.type, data: event.data };
        result.data.push(dataPart);
        if (knownDataPartTypes.includes(event.type)) {
          config.onDataPart?.(dataPart as KnownDataPart);
        } else {
          console.warn("Skipping unknown data part:", dataPart);
        }
      }

      // NOTE: allowed events not yet handled
      //   lifecycle:  start, start-step, finish-step, abort
      //   text:       text-start, text-end
      //   tool:       tool-input-delta, tool-input-error, tool-approval-request,
      //               tool-output-denied
      //   reasoning:  reasoning-start, reasoning-delta, reasoning-end, reasoning-file
      //   sources:    source-url, source-document
      //   files:      file
      break;
    }
  }
}
