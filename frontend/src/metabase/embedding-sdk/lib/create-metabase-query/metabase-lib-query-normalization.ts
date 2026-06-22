import type { StructuredDatasetQuery } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { normalizeBreakout } from "./metabase-lib-query-utils";

export const normalizeDatasetQuery = (
  datasetQuery: StructuredDatasetQuery,
  breakouts?: readonly unknown[],
): StructuredDatasetQuery => ({
  ...datasetQuery,
  parameters: datasetQuery.parameters ?? [],
  query: preserveBreakoutBinning(
    stripFieldRefBaseTypes(datasetQuery.query),
    breakouts,
  ),
});

function preserveBreakoutBinning<TValue>(
  query: TValue,
  breakouts?: readonly unknown[],
): TValue {
  if (!isPlainObject(query) || !Array.isArray(query.breakout)) {
    return query;
  }

  return {
    ...query,
    breakout: query.breakout.map((breakout, index) => {
      const { options } = normalizeBreakout(breakouts?.[index]);

      return preserveFieldRefBinning(breakout, options.binning);
    }),
  } as TValue;
}

function preserveFieldRefBinning<TValue>(
  value: TValue,
  binning: unknown,
): TValue {
  if (
    !isPlainObject(binning) ||
    !Array.isArray(value) ||
    value[0] !== "field"
  ) {
    return value;
  }

  const options = isPlainObject(value[2]) ? value[2] : {};

  return [
    value[0],
    value[1],
    { ...options, binning },
    ...value.slice(3),
  ] as TValue;
}

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value);
}
