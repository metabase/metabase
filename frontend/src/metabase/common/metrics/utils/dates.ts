import { dayjs } from "metabase/dayjs";
import {
  DATE_PICKER_EXTRACTION_UNITS,
  DATE_PICKER_TRUNCATION_UNITS,
} from "metabase/querying/common/constants";
import type {
  DateFilterValue,
  DatePickerExtractionUnit,
  DatePickerTruncationUnit,
  DatePickerUnit,
  DatePickerValue,
  ExcludeDatePickerValue,
  MonthYearPickerValue,
  QuarterYearPickerValue,
  RelativeDatePickerValue,
  SpecificDatePickerValue,
} from "metabase/querying/common/types";
import type { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import * as LibMetric from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import type { DimensionWithDefinition } from "../types";

export function isDatePickerUnit(unit: string): unit is DatePickerUnit {
  return isDatePickerTruncationUnit(unit) || isDatePickerExtractionUnit(unit);
}

export function isDatePickerTruncationUnit(
  unit: string,
): unit is DatePickerTruncationUnit {
  const units: ReadonlyArray<string> = DATE_PICKER_TRUNCATION_UNITS;
  return units.includes(unit);
}

export function isDatePickerExtractionUnit(
  unit: string,
): unit is DatePickerExtractionUnit {
  const units: ReadonlyArray<string> = DATE_PICKER_EXTRACTION_UNITS;
  return units.includes(unit);
}

export function getDatePickerUnits(
  definition: LibMetric.MetricDefinition,
  dimension: LibMetric.DimensionMetadata,
): DatePickerUnit[] {
  return LibMetric.availableTemporalBuckets(definition, dimension)
    .map((bucket) => LibMetric.displayInfo(definition, bucket).shortName)
    .filter(isDatePickerUnit);
}

type MetricDateFilterDisplayValue = Extract<
  Parameters<typeof getDateFilterDisplayName>[0],
  { type: "specific" | "relative" | "exclude" }
>;

type MetricDateFilterParts =
  | ({ type: "specific-date" } & Omit<
      LibMetric.SpecificDateFilterParts,
      "dimension"
    >)
  | ({ type: "relative-date" } & Omit<
      LibMetric.RelativeDateFilterParts,
      "dimension"
    >)
  | ({ type: "exclude-date" } & Omit<
      LibMetric.ExcludeDateFilterParts,
      "dimension"
    >);

export function toDateFilterDisplayValue(
  filter: MetricDateFilterParts,
): MetricDateFilterDisplayValue {
  switch (filter.type) {
    case "specific-date":
      return {
        type: "specific",
        operator: filter.operator,
        values: filter.values,
        hasTime: filter.hasTime,
      };
    case "relative-date":
      return {
        type: "relative",
        unit: filter.unit,
        value: filter.value,
        offsetUnit: filter.offsetUnit ?? undefined,
        offsetValue: filter.offsetValue ?? undefined,
        options: filter.options ?? undefined,
      };
    case "exclude-date":
      return {
        type: "exclude",
        operator: filter.operator,
        unit: filter.unit ?? undefined,
        values: filter.values,
      };
  }
}

export function getDateFilterDisplayValue(
  definition: LibMetric.MetricDefinition,
  filterClause: LibMetric.FilterClause,
): MetricDateFilterDisplayValue | undefined {
  const specificParts = LibMetric.specificDateFilterParts(
    definition,
    filterClause,
  );
  if (specificParts) {
    return toDateFilterDisplayValue({
      type: "specific-date",
      ...specificParts,
    });
  }
  const relativeParts = LibMetric.relativeDateFilterParts(
    definition,
    filterClause,
  );
  if (relativeParts) {
    return toDateFilterDisplayValue({
      type: "relative-date",
      ...relativeParts,
    });
  }
  const excludeParts = LibMetric.excludeDateFilterParts(
    definition,
    filterClause,
  );
  if (excludeParts) {
    return toDateFilterDisplayValue({ type: "exclude-date", ...excludeParts });
  }
  return undefined;
}

export function getDatePickerValue(
  definition: LibMetric.MetricDefinition,
  filterClause: LibMetric.FilterClause,
): DatePickerValue | undefined {
  const value = getDateFilterDisplayValue(definition, filterClause);
  if (value?.type !== "relative") {
    return value;
  }
  const { unit, offsetUnit } = value;
  if (
    !isDatePickerTruncationUnit(unit) ||
    (offsetUnit != null && !isDatePickerTruncationUnit(offsetUnit))
  ) {
    return undefined;
  }
  return { ...value, unit, offsetUnit };
}

export function getDateFilterClause(
  dimension: LibMetric.DimensionMetadata,
  value: DateFilterValue,
): LibMetric.FilterClause {
  switch (value.type) {
    case "specific":
      return getSpecificFilterClause(dimension, value);
    case "relative":
      return getRelativeFilterClause(dimension, value);
    case "exclude":
      return getExcludeFilterClause(dimension, value);
    case "month":
      return getMonthYearFilterClause(dimension, value);
    case "quarter":
      return getQuarterYearFilterClause(dimension, value);
  }
}

function getSpecificFilterClause(
  dimension: LibMetric.DimensionMetadata,
  value: SpecificDatePickerValue,
): LibMetric.FilterClause {
  return LibMetric.specificDateFilterClause({
    operator: value.operator,
    dimension,
    values: value.values,
    hasTime: value.hasTime,
  });
}

function getRelativeFilterClause(
  dimension: LibMetric.DimensionMetadata,
  value: RelativeDatePickerValue,
): LibMetric.FilterClause {
  return LibMetric.relativeDateFilterClause({
    dimension,
    unit: value.unit,
    value: value.value,
    offsetUnit: value.offsetUnit ?? null,
    offsetValue: value.offsetValue ?? null,
    options: { ...value.options },
  });
}

function getExcludeFilterClause(
  dimension: LibMetric.DimensionMetadata,
  value: ExcludeDatePickerValue,
): LibMetric.FilterClause {
  return LibMetric.excludeDateFilterClause({
    operator: value.operator,
    unit: value.unit ?? null,
    dimension,
    values: value.values,
  });
}

function getMonthYearFilterClause(
  dimension: LibMetric.DimensionMetadata,
  value: MonthYearPickerValue,
): LibMetric.FilterClause {
  const startOfMonth = dayjs()
    .year(value.year)
    .month(value.month - 1)
    .startOf("month")
    .toDate();
  const endOfMonth = dayjs(startOfMonth).endOf("month").startOf("day").toDate();

  return LibMetric.specificDateFilterClause({
    operator: "between",
    dimension,
    values: [startOfMonth, endOfMonth],
    hasTime: false,
  });
}

function getQuarterYearFilterClause(
  dimension: LibMetric.DimensionMetadata,
  value: QuarterYearPickerValue,
): LibMetric.FilterClause {
  const startOfQuarter = dayjs()
    .year(value.year)
    .quarter(value.quarter)
    .startOf("quarter")
    .toDate();
  const endOfQuarter = dayjs(startOfQuarter)
    .endOf("quarter")
    .startOf("day")
    .toDate();

  return LibMetric.specificDateFilterClause({
    operator: "between",
    dimension,
    values: [startOfQuarter, endOfQuarter],
    hasTime: false,
  });
}

export function getTemporalUnits(
  definition: LibMetric.MetricDefinition,
  dimension: LibMetric.DimensionMetadata,
): TemporalUnit[] {
  return LibMetric.availableTemporalBuckets(definition, dimension).map(
    (bucket) => {
      const bucketInfo = LibMetric.displayInfo(definition, bucket);
      return bucketInfo.shortName;
    },
  );
}

export function getCommonTemporalUnits(
  dimensions: DimensionWithDefinition[],
): TemporalUnit[] {
  if (dimensions.length === 0) {
    return [];
  }

  const initialUnits = getTemporalUnits(
    dimensions[0].definition,
    dimensions[0].dimension,
  );
  return dimensions.reduce((availableUnits, dimension) => {
    const currentUnits = new Set(
      getTemporalUnits(dimension.definition, dimension.dimension),
    );
    return availableUnits.filter((unit) => currentUnits.has(unit));
  }, initialUnits);
}
