import type { ParameterValueOrArray } from "metabase-types/api";

function normalizeArray(value: ParameterValueOrArray | null | undefined) {
  if (value == null) {
    return [];
  } else {
    return Array.isArray(value) ? value : [value];
  }
}

export function normalizeNumberParameterValue(
  value: ParameterValueOrArray | null | undefined,
): number[] {
  return normalizeArray(value).reduce((values: number[], item) => {
    const number = typeof item === "number" ? item : parseFloat(String(item));
    if (isFinite(number)) {
      values.push(number);
    }
    return values;
  }, []);
}
