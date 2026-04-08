import { isMatching } from "ts-pattern";

import type { SSEEvent } from "metabase/lib/ai-sdk";
import { parseSSEStream } from "metabase/lib/ai-sdk";
import type { MetabotHistory } from "metabase-types/api";

import {
  type KnownDataPart,
  type ToolCallPart,
  type ToolResultPart,
  knownDataPartTypes,
  toolCallPartSchema,
  toolResultPartSchema,
} from "./schemas";

type ParsedStreamPart =
  | { name: "text"; value: string }
  | { name: "data"; value: KnownDataPart | { type: string; data: unknown } }
  | { name: "tool_call"; value: ToolCallPart }
  | { name: "tool_result"; value: ToolResultPart }
  | { name: "error"; value: unknown }
  | { name: "finish"; value: undefined };

type ParsedStreamPartName = ParsedStreamPart["name"];

function isKnownDataPart(part: ParsedStreamPart): part is Extract<
  ParsedStreamPart,
  { name: "data" }
> & {
  value: KnownDataPart;
} {
  return (
    part.name === "data" && knownDataPartTypes.includes(part.value.type as any)
  );
}

type AccumulatedStreamParts = {
  toolCalls: (
    | { toolCallId: string; toolName: string; state: "call" }
    | { toolCallId: string; toolName: string; state: "result"; value: unknown }
  )[];
  text: null | string;
  data: unknown[];
  parts: ParsedStreamPart[];
  history: MetabotHistory;
};

function accumulateStreamParts(streamParts: ParsedStreamPart[]) {
  const acc: AccumulatedStreamParts = {
    toolCalls: [],
    data: [],
    text: null,
    parts: streamParts,
    history: [],
  };

  return streamParts.reduce((acc, streamPart, index) => {
    if (streamPart.name === "text") {
      const lastStreamPart = streamParts[index - 1];
      acc.text = `${acc.text ?? ""}${streamPart.value}`;
      if (lastStreamPart?.name === "text") {
        const historyEntry = acc.history.pop();
        acc.history.push({
          ...historyEntry,
          content: historyEntry.content + streamPart.value,
        });
      } else {
        acc.history.push({ role: "assistant", content: streamPart.value });
      }
    }
    if (streamPart.name === "data") {
      acc.data = acc.data.concat(streamPart.value);
    }
    if (streamPart.name === "tool_call") {
      acc.toolCalls.push({ ...streamPart.value, state: "call" });
      acc.history.push({
        role: "assistant",
        tool_calls: [
          {
            id: streamPart.value.toolCallId,
            name: streamPart.value.toolName,
            arguments:
              typeof streamPart.value.input === "string"
                ? streamPart.value.input
                : JSON.stringify(streamPart.value.input),
          },
        ],
      });
    }
    if (streamPart.name === "tool_result") {
      const toolCallId = streamPart.value.toolCallId;
      const index = acc.toolCalls.findIndex((v) => v.toolCallId === toolCallId);

      if (index === -1) {
        throw new Error(
          "Tool Results must be preceded by the tool call with the same toolCallId",
        );
      }

      acc.toolCalls[index] = {
        ...acc.toolCalls[index],
        state: "result",
        value: streamPart.value.output,
      };
      acc.history.push({
        role: "tool",
        content: streamPart.value.output,
        tool_call_id: streamPart.value.toolCallId,
      });
    }

    return acc;
  }, acc);
}

type StreamPartValue<name extends ParsedStreamPartName> = Extract<
  ParsedStreamPart,
  { name: name }
>["value"];

export type AIStreamingConfig = {
  onTextPart?: (part: StreamPartValue<"text">) => void;
  onDataPart?: (part: KnownDataPart) => void;
  onToolCallPart?: (part: StreamPartValue<"tool_call">) => void;
  onToolResultPart?: (part: StreamPartValue<"tool_result">) => void;
  onError?: (error: StreamPartValue<"error">) => void;
};

export interface ProcessedChatResponse extends AccumulatedStreamParts {
  aborted: boolean;
}

/**
 * Processes an SSE stream that follows the AI SDK v6 protocol and notifies
 * the appropriate handlers as text, data, tool call, etc. parts come in.
 *
 * This function does not error on aborted requests and will return whatever
 * values that it has received so far as a result.
 */
export async function processChatResponse(
  stream: ReadableStream<Uint8Array>,
  config: AIStreamingConfig,
): Promise<ProcessedChatResponse> {
  const parsedStreamParts: ParsedStreamPart[] = [];
  let aborted = false;

  try {
    for await (const event of parseSSEStream(stream)) {
      const part = sseEventToParsedPart(event);
      if (!part) {
        continue;
      }

      parsedStreamParts.push(part);

      if (part.name === "text") {
        config.onTextPart?.(part.value);
      }
      if (part.name === "data") {
        if (isKnownDataPart(part)) {
          config.onDataPart?.(part.value);
        } else {
          console.warn("Skipping unknown data part:", part);
        }
      }
      if (part.name === "tool_call") {
        config.onToolCallPart?.(part.value);
      }
      if (part.name === "tool_result") {
        config.onToolResultPart?.(part.value);
      }
      if (part.name === "error") {
        config.onError?.(part.value);
      }
    }
  } catch (err) {
    if (isMatching({ name: "AbortError" }, err)) {
      aborted = true;
    } else {
      throw err;
    }
  }

  return {
    ...accumulateStreamParts(parsedStreamParts),
    aborted,
  };
}

/**
 * Convert an SSE event to a ParsedStreamPart, or null if the event
 * is a lifecycle event that doesn't produce a stream part.
 */
function sseEventToParsedPart(event: SSEEvent): ParsedStreamPart | null {
  const { type } = event;

  switch (type) {
    // Text: only emit on text-delta (start/end are lifecycle)
    case "text-delta":
      return { name: "text", value: event.delta };

    // Tool call: emit when input is available (start is lifecycle)
    case "tool-input-available": {
      const validated = toolCallPartSchema.validateSync(event, {
        strict: false,
      });
      return {
        name: "tool_call",
        value: validated as ToolCallPart,
      };
    }

    // Tool result: emit when output is available
    case "tool-output-available": {
      const validated = toolResultPartSchema.validateSync(event, {
        strict: false,
      });
      return {
        name: "tool_result",
        value: validated as ToolResultPart,
      };
    }

    // Error
    case "error":
      return {
        name: "error",
        value: (event as { type: "error"; errorText: string }).errorText,
      };

    // Finish
    case "finish":
      return { name: "finish", value: undefined };

    // Lifecycle events we ignore
    case "start":
    case "start-step":
    case "finish-step":
    case "text-start":
    case "text-end":
    case "tool-input-start":
    case "tool-input-delta":
      return null;

    default: {
      // Data parts: type starts with "data-"
      const eventType: string = type;
      if (eventType.startsWith("data-")) {
        return {
          name: "data",
          value: {
            type: eventType,
            data: (event as { data: unknown }).data,
          },
        };
      }
      console.warn(`Received unknown SSE event type: ${eventType}`);
      return null;
    }
  }
}
