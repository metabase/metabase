import type { ColumnMetadata, ExpressionClause } from "metabase-lib";
import * as Lib from "metabase-lib";
import { isObject } from "metabase-types/guards";

import type { DimensionFilterInput } from "../input-types";

type RelativeDateFilterParts = {
  value: number;
  unit: Lib.RelativeDateFilterUnit;
  offsetValue: number | null;
  offsetUnit: Lib.RelativeDateFilterUnit | null;
  options: Lib.RelativeDateFilterOptions;
};

type RelativeDateFilterInput = {
  value: number;
  unit: Lib.RelativeDateFilterUnit;
  options: Record<string, unknown>;
  offsetValue?: number;
  offsetUnit?: Lib.RelativeDateFilterUnit;
};

const RELATIVE_DATE_FILTER_UNITS = new Set<string>([
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
]);

export function buildLibRelativeDateFilter(
  filter: DimensionFilterInput,
  column: ColumnMetadata,
): ExpressionClause | null {
  const parts = getRelativeDateFilterParts(filter);

  if (!parts) {
    return null;
  }

  return Lib.relativeDateFilterClause({
    column,
    ...parts,
  });
}

function getRelativeDateFilterParts(
  filter: DimensionFilterInput,
): RelativeDateFilterParts | null {
  const values =
    filter.values ?? (Array.isArray(filter.value) ? filter.value : null);

  if (values) {
    const [value, unit, options, offsetValue, offsetUnit] = values;

    return createRelativeDateFilterParts(
      parseRelativeDateFilterInput({
        value,
        unit,
        options,
        offsetValue,
        offsetUnit,
      }),
    );
  }

  if (!isObject(filter.value)) {
    return null;
  }

  return createRelativeDateFilterParts(
    parseRelativeDateFilterInput({
      value: filter.value.value,
      unit: filter.value.unit,
      options: filter.value.options,
      offsetValue: filter.value.offsetValue,
      offsetUnit: filter.value.offsetUnit,
    }),
  );
}

function createRelativeDateFilterParts(
  input: RelativeDateFilterInput | null,
): RelativeDateFilterParts | null {
  if (!input) {
    return null;
  }

  const { value, unit, options, offsetValue, offsetUnit } = input;

  const parsedOffsetValue =
    typeof offsetValue === "number"
      ? offsetValue
      : (getNumberOption(options, "offsetValue") ?? null);

  const optionsOffsetUnit = getStringOption(options, "offsetUnit");

  const parsedOffsetUnit = isRelativeDateFilterUnit(offsetUnit)
    ? offsetUnit
    : isRelativeDateFilterUnit(optionsOffsetUnit)
      ? optionsOffsetUnit
      : null;

  return {
    value,
    unit,
    offsetValue: parsedOffsetValue,
    offsetUnit: parsedOffsetUnit,
    options: getRelativeDateFilterOptions(options),
  };
}

function parseRelativeDateFilterInput({
  value,
  unit,
  options,
  offsetValue,
  offsetUnit,
}: {
  value: unknown;
  unit: unknown;
  options?: unknown;
  offsetValue?: unknown;
  offsetUnit?: unknown;
}): RelativeDateFilterInput | null {
  if (typeof value !== "number" || !isRelativeDateFilterUnit(unit)) {
    return null;
  }

  return {
    value,
    unit,
    options: isObject(options) ? options : {},
    offsetValue: typeof offsetValue === "number" ? offsetValue : undefined,
    offsetUnit: isRelativeDateFilterUnit(offsetUnit) ? offsetUnit : undefined,
  };
}

function getRelativeDateFilterOptions(
  options: Record<string, unknown>,
): Lib.RelativeDateFilterOptions {
  const includeCurrent = getBooleanOption(options, "includeCurrent");

  return includeCurrent === true ? { includeCurrent: true } : {};
}

const getBooleanOption = (
  options: Record<string, unknown>,
  key: string,
): boolean | null => (typeof options[key] === "boolean" ? options[key] : null);

const getNumberOption = (
  options: Record<string, unknown>,
  key: string,
): number | null => (typeof options[key] === "number" ? options[key] : null);

const getStringOption = (
  options: Record<string, unknown>,
  key: string,
): string | null => (typeof options[key] === "string" ? options[key] : null);

const isRelativeDateFilterUnit = (
  value: unknown,
): value is Lib.RelativeDateFilterUnit =>
  typeof value === "string" && RELATIVE_DATE_FILTER_UNITS.has(value);
