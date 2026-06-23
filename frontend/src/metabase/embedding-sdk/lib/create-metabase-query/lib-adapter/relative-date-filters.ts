import { DATE_PICKER_TRUNCATION_UNITS } from "metabase/querying/common/constants";
import type { ColumnMetadata, ExpressionClause } from "metabase-lib";
import * as Lib from "metabase-lib";
import { isObject } from "metabase-types/guards";

import type { DimensionFilterInput } from "../input-types";

type RelativeDateFilterParts = Omit<Lib.RelativeDateFilterParts, "column">;

type RelativeDateFilterInput = {
  value: number;
  unit: Lib.RelativeDateFilterUnit;
  offsetValue?: number;
  offsetUnit?: Lib.RelativeDateFilterUnit;
  options?: RelativeDateFilterOptionsInput;
};

type RelativeDateFilterOptionsInput = Lib.RelativeDateFilterOptions & {
  offsetValue?: number;
  offsetUnit?: Lib.RelativeDateFilterUnit;
};

const RELATIVE_DATE_FILTER_UNITS: ReadonlyArray<string> =
  DATE_PICKER_TRUNCATION_UNITS;

export function buildLibRelativeDateFilter(
  filter: DimensionFilterInput,
  column: ColumnMetadata,
): ExpressionClause | null {
  const parts = getRelativeDateFilterParts(filter);

  if (!parts) {
    return null;
  }

  return Lib.relativeDateFilterClause({ column, ...parts });
}

function getRelativeDateFilterParts(
  filter: DimensionFilterInput,
): RelativeDateFilterParts | null {
  const input = parseRelativeDateFilterInput(filter.values ?? filter.value);

  if (!input) {
    return null;
  }

  const options = input.options ?? {};

  return {
    value: input.value,
    unit: input.unit,
    offsetValue: input.offsetValue ?? options.offsetValue ?? null,
    offsetUnit: input.offsetUnit ?? options.offsetUnit ?? null,
    options: getLibRelativeDateFilterOptions(options),
  };
}

function parseRelativeDateFilterInput(
  input: unknown,
): RelativeDateFilterInput | null {
  if (Array.isArray(input)) {
    const [value, unit, options, offsetValue, offsetUnit] = input;

    return parseRelativeDateFilterValue({
      value,
      unit,
      options,
      offsetValue,
      offsetUnit,
    });
  }

  if (!isObject(input)) {
    return null;
  }

  return parseRelativeDateFilterValue({
    value: input.value,
    unit: input.unit,
    options: input.options,
    offsetValue: input.offsetValue,
    offsetUnit: input.offsetUnit,
  });
}

function parseRelativeDateFilterValue({
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
    offsetValue: typeof offsetValue === "number" ? offsetValue : undefined,
    offsetUnit: isRelativeDateFilterUnit(offsetUnit) ? offsetUnit : undefined,
    options: parseRelativeDateFilterOptions(options),
  };
}

function parseRelativeDateFilterOptions(
  options: unknown,
): RelativeDateFilterOptionsInput {
  if (!isObject(options)) {
    return {};
  }

  return {
    includeCurrent:
      typeof options.includeCurrent === "boolean"
        ? options.includeCurrent
        : undefined,
    offsetValue:
      typeof options.offsetValue === "number" ? options.offsetValue : undefined,
    offsetUnit: isRelativeDateFilterUnit(options.offsetUnit)
      ? options.offsetUnit
      : undefined,
  };
}

const getLibRelativeDateFilterOptions = (
  options: Lib.RelativeDateFilterOptions,
): Lib.RelativeDateFilterOptions =>
  options.includeCurrent === true ? { includeCurrent: true } : {};

const isRelativeDateFilterUnit = (
  value: unknown,
): value is Lib.RelativeDateFilterUnit =>
  typeof value === "string" && RELATIVE_DATE_FILTER_UNITS.includes(value);
