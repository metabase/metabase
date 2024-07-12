import dayjs from "dayjs";

import type { ParameterType, WritebackParameter } from "metabase-types/api";

type SdkParameterType = ParameterType | "category";
type Parameter = Pick<WritebackParameter, "id" | "type" | "target" | "value">;
type SdkParameterValue = string | number | Date;
export type SdkParameterValues = Record<string, SdkParameterValue>;

export function getQuestionParameterByValues(
  parameterValues: SdkParameterValues,
): Parameter[] {
  const parameters: Parameter[] = [];

  for (const [key, value] of Object.entries(parameterValues)) {
    const [type, parsedValue] = parseParameterValue(value) ?? [];

    // Unsupported parameter types are ignored.
    if (!type) {
      continue;
    }

    // TODO: get the id from somewhere...
    const id = "";

    parameters.push({
      id,
      type,
      target: ["variable", ["template-tag", key]],
      value: parsedValue,
    });
  }

  return parameters;
}

function parseParameterValue(
  value: SdkParameterValue,
): [SdkParameterType, any] | null {
  if (typeof value === "number") {
    return ["number/=", value];
  }

  if (typeof value === "string") {
    return ["category", value];
  }

  if (value instanceof Date) {
    const date = dayjs(value).format("YYYY-MM-DD");

    return ["date/single", date];
  }

  return null;
}
