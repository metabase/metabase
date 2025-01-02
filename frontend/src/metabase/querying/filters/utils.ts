import * as Lib from "metabase-lib";

import {
  DATE_PICKER_EXTRACTION_UNITS,
  DATE_PICKER_OPERATORS,
  DATE_PICKER_TRUNCATION_UNITS,
} from "./constants";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  DatePickerTruncationUnit,
  DatePickerUnit,
  FilterOperatorOption,
} from "./types";

export function getGroupName(
  groupInfo: Lib.ColumnGroupDisplayInfo,
  stageIndex: number,
) {
  return groupInfo.isMainGroup && stageIndex > 1
    ? `${groupInfo.displayName} (${stageIndex})`
    : groupInfo.displayName;
}

export function isDatePickerOperator(
  operator: string,
): operator is DatePickerOperator {
  const operators: ReadonlyArray<string> = DATE_PICKER_OPERATORS;
  return operators.includes(operator);
}

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

export function getAvailableOperatorOptions<
  T extends FilterOperatorOption<Lib.FilterOperatorName>,
>(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  options: Record<string, T>,
) {
  const operatorInfoByName = Object.fromEntries(
    Lib.filterableColumnOperators(column)
      .map(operator => Lib.displayInfo(query, stageIndex, operator))
      .map(operatorInfo => [operatorInfo.shortName, operatorInfo]),
  );

  return Object.values(options)
    .filter(option => operatorInfoByName[option.operator] != null)
    .map(option => ({
      name: operatorInfoByName[option.operator].longDisplayName,
      ...option,
    }));
}

export function getDefaultAvailableOperator<T extends Lib.FilterOperatorName>(
  options: FilterOperatorOption<T>[],
  desiredOperator?: T,
): T {
  return (
    options.find(option => option.operator === desiredOperator)?.operator ??
    options[0].operator
  );
}
