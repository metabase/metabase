import type { ParameterValuesMap } from "metabase-types/api";

export function isParameterValuesMap(
  value: unknown,
): value is ParameterValuesMap {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const isScalar = (item: unknown) =>
    item == null ||
    typeof item === "string" ||
    typeof item === "number" ||
    typeof item === "boolean";
  return Object.values(value).every((item: unknown) =>
    Array.isArray(item) ? item.every(isScalar) : isScalar(item),
  );
}
