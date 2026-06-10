import { P, isMatching } from "ts-pattern";

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
import {
  type FinishReason,
  type MessageMetadata,
  type StartEvent,
  type ToolInputAvailableEvent,
  type ToolInputStartEvent,
  type ToolOutputAvailableEvent,
  type ToolOutputErrorEvent,
  isDataEvent,
} from "./sse-types";

export type StreamedChatError = {
  message: string;
  error_code?: string;
};

export type ToolCall =
  | { toolCallId: string; toolName: string; state: "call" }
  | {
      toolCallId: string;
      toolName: string;
      state: "result";
      value?: unknown;
      error?: string;
    };

export type DataPart = { type: `data-${string}`; data: unknown };

export type AIStreamingConfig = {
  onStartMessagePart?: (event: StartEvent) => void;
  onTextPart?: (delta: string) => void;
  // callback is only called if this version of the client is aware of the received data part type
  onDataPart?: (part: KnownDataPart) => void;
  onToolInputStart?: (event: ToolInputStartEvent) => void;
  onToolInputAvailable?: (event: ToolInputAvailableEvent) => void;
  onToolResultPart?: (event: ToolOutputAvailableEvent) => void;
  onToolErrorPart?: (event: ToolOutputErrorEvent) => void;
  onError?: (error: StreamedChatError) => void;
  onMessageMetadata?: (metadata: MessageMetadata) => void;
};

export interface ProcessedChatResponse {
  aborted: boolean;
  toolCalls: ToolCall[];
  history: MetabotHistory;
  data: DataPart[];
  error?: StreamedChatError;
  messageMetadata?: MessageMetadata;
  finishReason?: FinishReason;
}

const ERROR_DETAILS_DATA_TYPE = "data-error_details";

function isKnownDataPart(part: DataPart): part is KnownDataPart {
  return knownDataPartTypes.includes(part.type);
}

function stringifyToolValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Processes an AI SDK SSE response stream and notifies the appropriate
 * handlers as text, data, tool, etc. events come in.
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

  // id of the text block the last history entry belongs to, so consecutive
  // text-deltas stitch into one assistant message
  let openTextId: string | null = null;
  let errorDetails: StreamedChatError | undefined;

  const findToolCall = (toolCallId: string) => {
    const index = result.toolCalls.findIndex(
      (tc) => tc.toolCallId === toolCallId,
    );
    if (index === -1) {
      throw new Error(
        "Tool outputs must be preceded by the tool input with the same toolCallId",
      );
    }
    return index;
  };

  try {
    for await (const event of parseSSEStream(stream)) {
      if (isDataEvent(event)) {
        dataEventSchema.validateSync(event, { strict: true });
        const dataPart: DataPart = { type: event.type, data: event.data };
        result.data.push(dataPart);

        if (event.type === ERROR_DETAILS_DATA_TYPE) {
          const details = event.data;
          if (
            isMatching(
              { message: P.string, error_code: P.optional(P.string) },
              details,
            )
          ) {
            errorDetails = details;
          }
        } else if (isKnownDataPart(dataPart)) {
          config.onDataPart?.(dataPart);
        } else {
          console.warn("Skipping unknown data part:", event);
        }
        continue;
      }

      switch (event.type) {
        case "start":
          config.onStartMessagePart?.(event);
          break;

        case "text-start":
          openTextId = null;
          break;

        case "text-delta":
          config.onTextPart?.(event.delta);
          if (event.id === openTextId) {
            const entry = result.history[result.history.length - 1];
            entry.content += event.delta;
          } else {
            result.history.push({ role: "assistant", content: event.delta });
            openTextId = event.id;
          }
          break;

        case "text-end":
          openTextId = null;
          break;

        case "tool-input-start":
          config.onToolInputStart?.(event);
          break;

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
                arguments: stringifyToolValue(event.input),
              },
            ],
          });
          break;
        }

        case "tool-output-available": {
          toolOutputAvailableSchema.validateSync(event, { strict: true });
          const index = findToolCall(event.toolCallId);
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
          const index = findToolCall(event.toolCallId);
          config.onToolErrorPart?.(event);
          result.toolCalls[index] = {
            ...result.toolCalls[index],
            state: "result",
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
          const error: StreamedChatError = {
            message: event.errorText,
            error_code: errorDetails?.error_code,
          };
          result.error = error;
          config.onError?.(error);
          break;
        }

        case "message-metadata":
          result.messageMetadata = event.messageMetadata;
          config.onMessageMetadata?.(event.messageMetadata);
          break;

        case "finish":
          result.finishReason = event.finishReason;
          if (event.messageMetadata) {
            result.messageMetadata = event.messageMetadata;
            config.onMessageMetadata?.(event.messageMetadata);
          }
          break;

        case "start-step":
        case "finish-step":
          break;

        default:
          console.warn("Skipping unhandled SSE event:", event);
      }
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
