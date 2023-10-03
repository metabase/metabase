import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  DatePickerValue,
  ExcludeDatePickerValue,
  RelativeDatePickerValue,
} from "metabase/common/components/DatePicker";
import * as Lib from "metabase-lib";

export function getPickerValue(
  query: Lib.Query,
  stageIndex: number,
  filterClause: Lib.FilterClause,
): DatePickerValue | undefined {
  return getExcludeDateValue(query, stageIndex, filterClause);
}

function getExcludeDateValue(
  query: Lib.Query,
  stageIndex: number,
  filterClause: Lib.FilterClause,
): ExcludeDatePickerValue | undefined {
  const filterParts = Lib.excludeDateFilterParts(
    query,
    stageIndex,
    filterClause,
  );
  if (filterParts == null) {
    return undefined;
  }

  const operatorInfo = Lib.displayInfo(query, stageIndex, filterParts.operator);
  if (!isDateOperator(operatorInfo.shortName)) {
    return undefined;
  }
  if (!filterParts.bucket) {
    return {
      type: "exclude",
      operator: operatorInfo.shortName,
      values: filterParts.values,
    };
  }

  const bucketInfo = Lib.displayInfo(query, stageIndex, filterParts.bucket);
  if (!isDateExtractionUnit(bucketInfo.shortName)) {
    return undefined;
  }

  return {
    type: "exclude",
    operator: operatorInfo.shortName,
    unit: bucketInfo.shortName,
    values: filterParts.values,
  };
}

export function getFilterClause(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  value: DatePickerValue,
): Lib.ExpressionClause {
  switch (value.type) {
    case "relative":
      return getRelativeFilterClause(query, stageIndex, column, value);
    case "exclude":
      return getExcludeFilterClause(query, stageIndex, column, value);
  }
}

function getRelativeFilterClause(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  value: RelativeDatePickerValue,
): Lib.ExpressionClause {
  return Lib.relativeDateFilterClause({
    column,
    bucket: value.unit,
    value: value.value,
    offsetBucket: value.offsetUnit,
    offsetValue: value.offsetValue,
    options: {},
  });
}

function getExcludeFilterClause(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  value: ExcludeDatePickerValue,
): Lib.ExpressionClause {
  const operator = Lib.findFilterOperator(
    query,
    stageIndex,
    column,
    value.operator,
  );
  const bucket = value.unit
    ? Lib.findTemporalBucket(query, stageIndex, column, value.unit)
    : null;
  if (!operator) {
    throw new TypeError();
  }

  return Lib.excludeDateFilterClause(query, stageIndex, {
    operator,
    bucket,
    column,
    values: value.values,
  });
}

export function getPickerOperators(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): DatePickerOperator[] {
  const operators = Lib.filterableColumnOperators(column);
  return operators.reduce((results: DatePickerOperator[], operator) => {
    const operatorInfo = Lib.displayInfo(query, stageIndex, operator);
    if (isDateOperator(operatorInfo.shortName)) {
      results.push(operatorInfo.shortName);
    }
    return results;
  }, []);
}

export function getPickerUnits(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): DatePickerExtractionUnit[] {
  const buckets = Lib.availableTemporalBuckets(query, stageIndex, column);
  return buckets.reduce((results: DatePickerExtractionUnit[], bucket) => {
    const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
    if (isDateExtractionUnit(bucketInfo.shortName)) {
      results.push(bucketInfo.shortName);
    }
    return results;
  }, []);
}

function isDateOperator(
  operatorName: Lib.FilterOperatorName,
): operatorName is DatePickerOperator {
  switch (operatorName) {
    case "=":
    case "!=":
    case "<":
    case ">":
    case "between":
    case "is-null":
    case "not-null":
      return true;
    default:
      return false;
  }
}

function isDateExtractionUnit(
  bucketName: Lib.BucketName,
): bucketName is DatePickerExtractionUnit {
  switch (bucketName) {
    case "hour-of-day":
    case "day-of-week":
    case "month-of-year":
    case "quarter-of-year":
      return true;
    default:
      return false;
  }
}
