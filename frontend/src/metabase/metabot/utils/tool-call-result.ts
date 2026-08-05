const STRUCTURED_OUTPUT_KEYS = ["structured_output", "structured-output"];

export type ToolCallOutput = {
  value: string;
  isJson: boolean;
};

export type ParsedToolCallResult = {
  output?: ToolCallOutput;
  structuredOutput?: string;
  extra?: string;
};

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const parseJson = (
  value: string,
): { parsed: true; value: unknown } | { parsed: false } => {
  try {
    return { parsed: true, value: JSON.parse(value) };
  } catch {
    return { parsed: false };
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStructuredValue = (value: unknown) =>
  typeof value === "object" && value !== null;

const formatOutput = (output: unknown): ToolCallOutput | undefined => {
  if (output == null || output === "") {
    return undefined;
  }
  if (typeof output !== "string") {
    return { value: prettyJson(output), isJson: true };
  }
  const result = parseJson(output);
  return result.parsed && isStructuredValue(result.value)
    ? { value: prettyJson(result.value), isJson: true }
    : { value: output, isJson: false };
};

export const parseToolCallResult = (
  result: string | null | undefined,
): ParsedToolCallResult => {
  if (!result) {
    return {};
  }

  const parsedResult = parseJson(result);
  if (!parsedResult.parsed || !isPlainObject(parsedResult.value)) {
    return { output: formatOutput(result) };
  }

  const resultMap = parsedResult.value;
  const structuredKey = STRUCTURED_OUTPUT_KEYS.find((key) => key in resultMap);
  if (!("output" in resultMap) && structuredKey === undefined) {
    return { output: { value: prettyJson(resultMap), isJson: true } };
  }

  const extraEntries = Object.entries(resultMap).filter(
    ([key]) => key !== "output" && key !== structuredKey,
  );

  return {
    output: formatOutput(resultMap.output),
    structuredOutput:
      structuredKey === undefined
        ? undefined
        : prettyJson(resultMap[structuredKey]),
    extra:
      extraEntries.length > 0
        ? prettyJson(Object.fromEntries(extraEntries))
        : undefined,
  };
};
