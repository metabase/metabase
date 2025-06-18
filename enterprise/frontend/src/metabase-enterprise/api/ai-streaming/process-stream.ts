import { match } from "ts-pattern";
import _ from "underscore";

import type { MetabotHistory } from "metabase-types/api";

import {
  dataPartSchema,
  finishPartSchema,
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
    console.warn(`Recieved invalid message code: ${prefix}`);
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

  return streamParts.reduce((acc, streamPart) => {
    if (streamPart.name === "text") {
      acc.text = `${acc.text ?? ""}${streamPart.value}`;
      // NOTE: "navigate-to" omitted... not sure how much it matters
      acc.history.push({ role: "assistant", content: streamPart.value });
    }
    if (streamPart.name === "data") {
      acc.data = acc.data.concat(streamPart.value);
    }
    if (streamPart.name === "tool_call") {
      acc.toolCalls.push({ ...streamPart.value, state: "call" });
      acc.history.push({
        role: "assistant",
        "tool-calls": [
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
        "tool-call-id": streamPart.value.toolCallId,
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
  onDataPart?: (part: StreamPartValue<"data">) => void;
  onToolCallPart?: (part: StreamPartValue<"tool_call">) => void;
  onToolResultPart?: (part: StreamPartValue<"tool_result">) => void;
  onStreamStateUpdate?: (
    state: ReturnType<typeof accumulateStreamParts>,
  ) => void;
  onError?: (error: Error) => void;
};

export async function processChatResponse(
  stream: ReadableStream<Uint8Array>,
  config: AIStreamingConfig,
) {
  const parsedStreamParts: ParsedStreamPart[] = [];
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let chunks: Uint8Array[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
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
        config.onDataPart?.(streamPart.value);
      }
      if (streamPart.name === "tool_call") {
        config.onToolCallPart?.(streamPart.value);
      }
      if (streamPart.name === "tool_result") {
        config.onToolResultPart?.(streamPart.value);
      }
      if (streamPart.name === "error") {
        config.onError?.(
          new Error(streamPart.value ? `${streamPart.value}` : "Unknown error"),
        );
      }
    }

    const accumulated = accumulateStreamParts(parsedStreamParts);
    config.onStreamStateUpdate?.(accumulated);
  }

  reader.releaseLock();

  return accumulateStreamParts(parsedStreamParts);
}
