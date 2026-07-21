import { P, isMatching, match } from "ts-pattern";

import { isReducedMotionPreferred } from "metabase/utils/dom";

import {
  type KnownDataPart,
  dataEventSchema,
  isKnownDataPart,
  toolInputAvailableSchema,
  toolOutputAvailableSchema,
  toolOutputErrorSchema,
} from "./schemas";
import { smoothStreamEvents } from "./smooth-stream";
import { parseSSEStream } from "./sse-stream";
import type {
  FinishReason,
  MessageMetadata,
  ReasoningDeltaEvent,
  ReasoningEndEvent,
  ReasoningStartEvent,
  StartEvent,
  ToolInputAvailableEvent,
  ToolInputStartEvent,
  ToolOutputAvailableEvent,
  ToolOutputErrorEvent,
} from "./sse-types";

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

export type StreamedError = { errorText: string };

export type AIStreamingConfig = {
  onStart?: (event: StartEvent) => void;
  onTextPart?: (delta: string) => void;
  onReasoningStart?: (event: ReasoningStartEvent) => void;
  onReasoningDelta?: (event: ReasoningDeltaEvent) => void;
  onReasoningEnd?: (event: ReasoningEndEvent) => void;
  // callback is only called if this version of the client is aware of the received data part type
  onDataPart?: (part: KnownDataPart) => void;
  onToolInputStart?: (event: ToolInputStartEvent) => void;
  onToolInputAvailable?: (event: ToolInputAvailableEvent) => void;
  onToolResultPart?: (event: ToolOutputAvailableEvent) => void;
  onToolErrorPart?: (event: ToolOutputErrorEvent) => void;
  onError?: (error: StreamedError) => void;
  onMessageMetadata?: (metadata: MessageMetadata) => void;
};

export interface ProcessedChatResponse {
  aborted: boolean;
  toolCalls: ToolCall[];
  data: DataPart[];
  messageMetadata?: MessageMetadata;
  finishReason?: FinishReason;
}

const requireToolCall = (toolCalls: ToolCall[], toolCallId: string) => {
  const index = toolCalls.findIndex((tc) => tc.toolCallId === toolCallId);
  if (index === -1) {
    throw new Error(
      "Tool Results must be preceded by the tool call with the same toolCallId",
    );
  }
  return index;
};

/**
 * Processes a stream that follows our AI response protocol and notifies
 * the appropriate handlers as text, data, tool call, etc. parts come in.
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
    data: [],
  };

  const events = parseSSEStream(stream);
  const paced = isReducedMotionPreferred() ? events : smoothStreamEvents(events);

  try {
    for await (const event of paced) {
      match(event)
        .with({ type: "start" }, (e) => config.onStart?.(e))
        .with({ type: "text-delta" }, (e) => config.onTextPart?.(e.delta))
        .with({ type: "reasoning-start" }, (e) => config.onReasoningStart?.(e))
        .with({ type: "reasoning-delta" }, (e) => config.onReasoningDelta?.(e))
        .with({ type: "reasoning-end" }, (e) => config.onReasoningEnd?.(e))
        .with({ type: "tool-input-start" }, (e) => config.onToolInputStart?.(e))
        .with({ type: "tool-input-available" }, (e) => {
          toolInputAvailableSchema.validateSync(e, { strict: true });
          config.onToolInputAvailable?.(e);
          result.toolCalls.push({
            toolCallId: e.toolCallId,
            toolName: e.toolName,
            state: "call",
          });
        })
        .with({ type: "tool-output-available" }, (e) => {
          toolOutputAvailableSchema.validateSync(e, { strict: true });
          const index = requireToolCall(result.toolCalls, e.toolCallId);
          config.onToolResultPart?.(e);
          result.toolCalls[index] = {
            ...result.toolCalls[index],
            state: "result",
            value: e.output,
          };
        })
        .with({ type: "tool-output-error" }, (e) => {
          toolOutputErrorSchema.validateSync(e, { strict: true });
          const index = requireToolCall(result.toolCalls, e.toolCallId);
          config.onToolErrorPart?.(e);
          result.toolCalls[index] = {
            ...result.toolCalls[index],
            state: "result",
            value: undefined,
            error: e.errorText,
          };
        })
        .with({ type: "error" }, (e) => {
          config.onError?.({ errorText: e.errorText });
        })
        .with({ type: "message-metadata" }, (e) => {
          result.messageMetadata = e.messageMetadata;
          config.onMessageMetadata?.(e.messageMetadata);
        })
        .with({ type: "finish" }, (e) => {
          if (e.finishReason) {
            result.finishReason = e.finishReason;
          }
          // finish chunk's usage supersedes any prior mid-stream snapshot
          if (e.messageMetadata) {
            result.messageMetadata = e.messageMetadata;
            config.onMessageMetadata?.(e.messageMetadata);
          }
        })
        .with({ type: P.string.startsWith("data-") }, (e) => {
          dataEventSchema.validateSync(e, { strict: true });
          const dataPart: DataPart = { type: e.type, data: e.data };
          result.data.push(dataPart);

          if (isKnownDataPart(dataPart)) {
            config.onDataPart?.(dataPart);
          } else {
            console.warn("Skipping unknown data part:", dataPart);
          }
        })
        .otherwise(() => {
          // NOTE: allowed events not yet handled
          //   lifecycle:  start-step, finish-step, abort
          //   text:       text-start, text-end
          //   tool:       tool-input-delta, tool-input-error, tool-approval-request,
          //               tool-output-denied
          //   sources:    source-url, source-document
          //   files:      file
        });
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
