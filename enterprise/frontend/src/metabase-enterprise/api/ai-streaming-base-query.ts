import * as Yup from "yup";

/**
A JSON value can be a string, number, boolean, object, array, or null.
JSON values can be serialized and deserialized by the JSON.stringify and JSON.parse methods.
 */
export type JSONValue =
  | null
  | string
  | number
  | boolean
  | { [value: string]: JSONValue }
  | Array<JSONValue>;

const NEWLINE = "\n".charCodeAt(0);

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

// concatenates all the chunks into a single Uint8Array
function concatChunks(chunks: Uint8Array[], totalLength: number) {
  const concatenatedChunks = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    concatenatedChunks.set(chunk, offset);
    offset += chunk.length;
  }
  chunks.length = 0;

  return concatenatedChunks;
}

const dataSchema = Yup.array().of(Yup.object());
const toolCallSchema = Yup.object({
  toolCallId: Yup.string().required(),
  toolName: Yup.string().required(),
  args: Yup.object(),
});
const toolResultSchema = Yup.object({
  toolCallId: Yup.string().required(),
  result: Yup.mixed(),
});
const finishSchema = Yup.object({
  finishReason: Yup.string()
    .oneOf([
      "stop",
      "length",
      "content-filter",
      "tool-calls",
      "error",
      "other",
      "unknown",
    ])
    .required(),
  usage: Yup.object({
    promptTokens: Yup.number().required(),
    completionTokens: Yup.number().required(),
  }),
});

function parseDataStreamPart(line: string) {
  const firstSeparatorIndex = line.indexOf(":");

  if (firstSeparatorIndex === -1) {
    throw new Error("Failed to parse stream string. No separator found.");
  }

  const prefix = line.slice(0, firstSeparatorIndex);

  if (!StreamingPartTypes.includes(prefix as StreamingPartType)) {
    throw new Error(`Failed to parse stream string. Invalid code ${prefix}.`);
  }

  const code = prefix as StreamingPartType;
  const textValue = line.slice(firstSeparatorIndex + 1);
  const jsonValue: JSONValue = JSON.parse(textValue);

  switch (code) {
    case StreamingPartTypeRegistry.TEXT:
      return {
        code,
        name: "text" as const,
        value: jsonValue,
      };
    case StreamingPartTypeRegistry.DATA:
      return {
        code,
        name: "data" as const,
        value: dataSchema.validateSync(jsonValue, { strict: true }),
      };
    case StreamingPartTypeRegistry.TOOL_CALL:
      return {
        code,
        name: "tool_call" as const,
        value: toolCallSchema.validateSync(jsonValue, { strict: true }),
      };
    case StreamingPartTypeRegistry.TOOL_RESULT:
      return {
        code,
        name: "tool_result" as const,
        value: toolResultSchema.validateSync(jsonValue, { strict: true }),
      };
    case StreamingPartTypeRegistry.ERROR:
      return {
        code,
        name: "error" as const,
        value: jsonValue,
      };
    case StreamingPartTypeRegistry.FINISH_MESSAGE:
      return {
        code,
        name: "finish_message" as const,
        value: finishSchema.validateSync(jsonValue, { strict: true }),
      };
    default: {
      const exhaustiveCheck: never = code;
      throw new Error(`Unknown stream part type: ${exhaustiveCheck}`);
    }
  }
}

type ParsedStreamPart = ReturnType<typeof parseDataStreamPart>;
type AccumulatedStreamParts = {
  toolCalls: (
    | {
        toolCallId: string;
        toolName: string;
        state: "call";
      }
    | {
        toolCallId: string;
        toolName: string;
        state: "result";
        value: unknown;
      }
  )[];
  text: null | string;
  data: unknown[];
  parts: ParsedStreamPart[];
};

function accumulateStreamParts(streamParts: ParsedStreamPart[]) {
  const acc: AccumulatedStreamParts = {
    toolCalls: [],
    data: [],
    text: null,
    parts: streamParts,
  };

  return streamParts.reduce((acc, streamPart) => {
    if (streamPart.name === "text") {
      acc.text = `${acc.text ?? ""}${streamPart.value}`;
    }
    if (streamPart.name === "data") {
      acc.data = acc.data.concat(streamPart.value);
    }
    if (streamPart.name === "tool_call") {
      acc.toolCalls.push({
        ...streamPart.value,
        state: "call",
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
    }

    return acc;
  }, acc);
}

type AIStreamingConfig = {
  onTextPart?: (part: Extract<ParsedStreamPart, { name: "text" }>) => void;
  onDataPart?: (part: Extract<ParsedStreamPart, { name: "data" }>) => void;
  onToolCallPart?: (
    part: Extract<ParsedStreamPart, { name: "tool_call" }>,
  ) => void;
  onToolResultPart?: (
    part: Extract<ParsedStreamPart, { name: "tool_result" }>,
  ) => void;
  onStreamStateUpdate?: (
    state: ReturnType<typeof accumulateStreamParts>,
  ) => void;
};

export async function aiStreamingQuery(
  url: string,
  requestInit: RequestInit,
  config?: AIStreamingConfig,
) {
  const response = await fetch(url, requestInit);

  if (!response || !response.body) {
    return {
      error: { status: "FETCH_ERROR", error: "No Response" },
    };
  }

  const parsedStreamParts: ParsedStreamPart[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value } = await reader.read();

      if (value) {
        chunks.push(value);
        totalLength += value.length;
        if (value[value.length - 1] !== NEWLINE) {
          // if the last character is not a newline, we have not read the whole JSON value
          continue;
        }
      }

      if (chunks.length === 0) {
        break; // we have reached the end of the stream
      }

      const concatenatedChunks = concatChunks(chunks, totalLength);
      totalLength = 0;

      const streamParts = decoder
        .decode(concatenatedChunks, { stream: true })
        .split("\n")
        .filter((line) => line !== "") // splitting leaves an empty string at the end
        .map(parseDataStreamPart);

      for (const streamPart of streamParts) {
        parsedStreamParts.push(streamPart);
        if (streamPart.name === "text" && config?.onTextPart) {
          config.onTextPart(streamPart);
        }
        if (streamPart.name === "data" && config?.onDataPart) {
          config.onDataPart(streamPart);
        }
        if (streamPart.name === "tool_call" && config?.onToolCallPart) {
          config.onToolCallPart(streamPart);
        }
        if (streamPart.name === "tool_result" && config?.onToolResultPart) {
          config.onToolResultPart(streamPart);
        }

        if (streamPart.name === "error") {
          return {
            error: {
              status: "FETCH_ERROR",
              error: streamPart.value,
            },
          };
        }
      }

      const accumulated = accumulateStreamParts(parsedStreamParts);
      if (config?.onStreamStateUpdate) {
        config.onStreamStateUpdate(accumulated);
      }
    }
  } catch (e) {
    console.error(e);
    return {
      error: {
        status: "FETCH_ERROR",
        error: "Unable to parse response",
      },
    };
  }

  return {
    data: accumulateStreamParts(parsedStreamParts),
  };
}
