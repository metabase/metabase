import { isMatching, match } from "ts-pattern";
import _ from "underscore";

import type { MetabotHistory } from "metabase-types/api";

import {
  type KnownDataPart,
  dataPartSchema,
  finishPartSchema,
  knownDataPartTypes,
  toolCallPartSchema,
  toolResultPartSchema,
} from "./schemas";
import type { JSONValue } from "./types";

const StreamingPartTypeRegistry = {
  TEXT: "0",
  DATA: "2",
  ERROR: "3",
  FINISH_MESSAGE: "d",
  TOOL_CALL: "9",
  TOOL_RESULT: "a",
} as const;

const StreamingPartTypes = Object.values(StreamingPartTypeRegistry);

type StreamingPartType = (typeof StreamingPartTypes)[number];

/**
 * Concatenates all the chunks into a single Uint8Array
 */
function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const concatenatedChunks = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    concatenatedChunks.set(chunk, offset);
    offset += chunk.length;
  }

  return concatenatedChunks;
}

function parseDataStreamPart(line: string) {
  const firstSeparatorIndex = line.indexOf(":");
  if (firstSeparatorIndex === -1) {
    throw new Error("Failed to parse stream string. No separator found.");
  }

  const prefix = line.slice(0, firstSeparatorIndex);
  if (!StreamingPartTypes.includes(prefix as StreamingPartType)) {
    console.warn(`Received invalid message code: ${prefix}`);
    return;
  }

  const code = prefix as StreamingPartType;
  const textValue = line.slice(firstSeparatorIndex + 1);
  const jsonValue: JSONValue = JSON.parse(textValue);

  return match(code)
    .with(StreamingPartTypeRegistry.TEXT, (code) => ({
      code,
      name: "text" as const,
      value: jsonValue,
    }))
    .with(StreamingPartTypeRegistry.DATA, (code) => ({
      code,
      name: "data" as const,
      value: dataPartSchema.validateSync(jsonValue, { strict: true }),
    }))
    .with(StreamingPartTypeRegistry.TOOL_CALL, (code) => ({
      code,
      name: "tool_call" as const,
      value: toolCallPartSchema.validateSync(jsonValue, { strict: true }),
    }))
    .with(StreamingPartTypeRegistry.TOOL_RESULT, (code) => ({
      code,
      name: "tool_result" as const,
      value: toolResultPartSchema.validateSync(jsonValue, { strict: true }),
    }))
    .with(StreamingPartTypeRegistry.ERROR, (code) => ({
      code,
      name: "error" as const,
      value: jsonValue,
    }))
    .with(StreamingPartTypeRegistry.FINISH_MESSAGE, (code) => ({
      code,
      name: "finish_message" as const,
      value: finishPartSchema.validateSync(jsonValue, { strict: true }),
    }))
    .exhaustive();
}

type ParsedStreamPart = Exclude<ReturnType<typeof parseDataStreamPart>, void>;
type ParsedStreamPartName = ParsedStreamPart["name"];

function isKnownDataPart(streamPart: ParsedStreamPart): streamPart is Omit<
  Extract<ParsedStreamPart, { name: "data" }>,
  "value"
> & {
  value: KnownDataPart;
} {
  return (
    streamPart.name === "data" &&
    knownDataPartTypes.includes(streamPart.value.type)
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
            arguments: streamPart.value.args,
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
        value: streamPart.value.result,
      };
      acc.history.push({
        role: "tool",
        content: streamPart.value.result,
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
  // callback is only called if this version of the client is aware of the received data part type
  onDataPart?: (part: KnownDataPart) => void;
  onToolCallPart?: (part: StreamPartValue<"tool_call">) => void;
  onToolResultPart?: (part: StreamPartValue<"tool_result">) => void;
  onError?: (error: StreamPartValue<"error">) => void;
};

export interface ProcessedChatResponse extends AccumulatedStreamParts {
  aborted: boolean;
}

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
  const parsedStreamParts: ParsedStreamPart[] = [];
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let chunks: Uint8Array[] = [];

  let aborted = false;
  while (!aborted) {
    try {
      const { value: chunk } = await reader.read();

      if (chunk) {
        chunks.push(chunk);
        if (chunk[chunk.length - 1] !== "\n".charCodeAt(0)) {
          // if the last character is not a newline, we have not read the whole JSON value
          continue;
        }
      }

      if (chunks.length === 0) {
        break; // we have reached the end of the stream
      }

      const concatenatedChunks = concatChunks(chunks);
      chunks = [];

      const streamParts = _.compact(
        decoder
          .decode(concatenatedChunks, { stream: true })
          .split("\n")
          .filter((line) => line !== "") // splitting leaves an empty string at the end
          .map(parseDataStreamPart),
      );

      for (const streamPart of streamParts) {
        parsedStreamParts.push(streamPart);

        if (streamPart.name === "text") {
          config.onTextPart?.(streamPart.value);
        }
        if (streamPart.name === "data") {
          if (isKnownDataPart(streamPart)) {
            config.onDataPart?.(streamPart.value);
          } else {
            console.warn("Skipping unknown data part:", streamPart);
          }
        }
        if (streamPart.name === "tool_call") {
          config.onToolCallPart?.(streamPart.value);
        }
        if (streamPart.name === "tool_result") {
          config.onToolResultPart?.(streamPart.value);
        }
        if (streamPart.name === "error") {
          config.onError?.(streamPart.value);
        }
      }
    } catch (err) {
      if (isMatching({ name: "AbortError" }, err)) {
        aborted = true;
      } else {
        throw err;
      }
    }
  }

  return {
    ...accumulateStreamParts(parsedStreamParts),
    aborted,
  };
}
