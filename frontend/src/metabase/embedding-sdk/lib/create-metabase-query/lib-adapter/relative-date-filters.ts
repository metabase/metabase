import { DATE_PICKER_TRUNCATION_UNITS } from "metabase/querying/common/constants";
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
  options: RelativeDateFilterOptionsInput;
  offsetValue?: number;
  offsetUnit?: Lib.RelativeDateFilterUnit;
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

  return Lib.relativeDateFilterClause({
    column,
    ...parts,
  });
}

function getRelativeDateFilterParts(
  filter: DimensionFilterInput,
): RelativeDateFilterParts | null {
  const input = getRelativeDateFilterInput(filter);

  if (!input) {
    return null;
  }

  const { value, unit, options, offsetValue, offsetUnit } = input;

  return {
    value,
    unit,
    offsetValue: offsetValue ?? options.offsetValue ?? null,
    offsetUnit: offsetUnit ?? options.offsetUnit ?? null,
    options: getRelativeDateFilterOptions(options),
  };
}

function getRelativeDateFilterInput(
  filter: DimensionFilterInput,
): RelativeDateFilterInput | null {
  const values =
    filter.values ?? (Array.isArray(filter.value) ? filter.value : null);

  if (values) {
    const [value, unit, options, offsetValue, offsetUnit] = values;

    return parseRelativeDateFilterInput({
      value,
      unit,
      options,
      offsetValue,
      offsetUnit,
    });
  }

  if (!isObject(filter.value)) {
    return null;
  }

  return parseRelativeDateFilterInput({
    value: filter.value.value,
    unit: filter.value.unit,
    options: filter.value.options,
    offsetValue: filter.value.offsetValue,
    offsetUnit: filter.value.offsetUnit,
  });
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
    options: parseRelativeDateFilterOptions(options),
    offsetValue: typeof offsetValue === "number" ? offsetValue : undefined,
    offsetUnit: isRelativeDateFilterUnit(offsetUnit) ? offsetUnit : undefined,
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

const getRelativeDateFilterOptions = (
  options: Lib.RelativeDateFilterOptions,
): Lib.RelativeDateFilterOptions =>
  options.includeCurrent === true ? { includeCurrent: true } : {};

const isRelativeDateFilterUnit = (
  value: unknown,
): value is Lib.RelativeDateFilterUnit =>
  typeof value === "string" && RELATIVE_DATE_FILTER_UNITS.includes(value);
