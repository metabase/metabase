const STRUCTURED_OUTPUT_KEYS = ["structured_output", "structured-output"];

export type ParsedToolCallResult = {
  output?: string;
  structuredOutput?: string;
  extra?: string;
};

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const toText = (value: unknown) => {
  if (value == null || value === "") {
    return undefined;
  }
  return typeof value === "string" ? value : prettyJson(value);
};

const parseResultMap = (
  result: string,
): Record<string, unknown> | undefined => {
  try {
    const parsed = JSON.parse(result);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
};

export const parseToolCallResult = (
  result: string | null | undefined,
): ParsedToolCallResult => {
  if (!result) {
    return {};
  }

  const resultMap = parseResultMap(result);
  if (!resultMap) {
    return { output: result };
  }

  const structuredKey = STRUCTURED_OUTPUT_KEYS.find((key) => key in resultMap);
  if (!("output" in resultMap) && !structuredKey) {
    return { output: prettyJson(resultMap) };
  }

  const extraEntries = Object.entries(resultMap).filter(
    ([key]) => key !== "output" && key !== structuredKey,
  );

  return {
    output: toText(resultMap.output),
    structuredOutput: structuredKey
      ? prettyJson(resultMap[structuredKey])
      : undefined,
    extra:
      extraEntries.length > 0
        ? prettyJson(Object.fromEntries(extraEntries))
        : undefined,
  };
};
