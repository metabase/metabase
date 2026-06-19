import type { StructuredDatasetQuery } from "metabase-types/api";

export const normalizeDatasetQuery = (
  datasetQuery: StructuredDatasetQuery,
): StructuredDatasetQuery => ({
  ...datasetQuery,
  parameters: datasetQuery.parameters ?? [],
  query: stripFieldRefBaseTypes(datasetQuery.query),
});

function stripFieldRefBaseTypes<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    if (
      value[0] === "field" &&
      typeof value[2] === "object" &&
      value[2] != null &&
      !Array.isArray(value[2])
    ) {
      const { "base-type": _baseType, ...options } = value[2] as Record<
        string,
        unknown
      >;

      return [
        value[0],
        value[1],
        stripFieldRefBaseTypes(options),
        ...value.slice(3).map(stripFieldRefBaseTypes),
      ] as TValue;
    }

    return value.map(stripFieldRefBaseTypes) as TValue;
  }

  if (typeof value === "object" && value != null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [
        key,
        stripFieldRefBaseTypes(childValue),
      ]),
    ) as TValue;
  }

  return value;
}
