import dayjs from "dayjs";

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

export function getDatePickerValue(
  definition: LibMetric.MetricDefinition,
  filterClause: LibMetric.FilterClause,
): DatePickerValue | undefined {
  return (
    getSpecificDateValue(definition, filterClause) ??
    getRelativeDateValue(definition, filterClause) ??
    getExcludeDateValue(definition, filterClause)
  );
}

function getSpecificDateValue(
  definition: LibMetric.MetricDefinition,
  filterClause: LibMetric.FilterClause,
): SpecificDatePickerValue | undefined {
  const filterParts = LibMetric.specificDateFilterParts(
    definition,
    filterClause,
  );
  if (filterParts == null) {
    return undefined;
  }

  return {
    type: "specific",
    operator: filterParts.operator,
    values: filterParts.values,
    hasTime: filterParts.hasTime,
  };
}

function getRelativeDateValue(
  definition: LibMetric.MetricDefinition,
  filterClause: LibMetric.FilterClause,
): RelativeDatePickerValue | undefined {
  const filterParts = LibMetric.relativeDateFilterParts(
    definition,
    filterClause,
  );
  if (filterParts == null) {
    return undefined;
  }

  return {
    type: "relative",
    unit: filterParts.unit,
    value: filterParts.value,
    offsetUnit: filterParts.offsetUnit ?? undefined,
    offsetValue: filterParts.offsetValue ?? undefined,
    options: filterParts.options,
  };
}

function getExcludeDateValue(
  definition: LibMetric.MetricDefinition,
  filterClause: LibMetric.FilterClause,
): ExcludeDatePickerValue | undefined {
  const filterParts = LibMetric.excludeDateFilterParts(
    definition,
    filterClause,
  );
  if (filterParts == null) {
    return undefined;
  }

  return {
    type: "exclude",
    operator: filterParts.operator,
    unit: filterParts.unit ?? undefined,
    values: filterParts.values,
  };
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
    options: value.options ?? {},
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
