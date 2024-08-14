import { getAvailableOperatorOptions } from "metabase/querying/utils/filters";
import * as Lib from "metabase-lib";

import { OPERATOR_OPTIONS } from "./constants";
import type { OptionType } from "./types";

export function getAvailableOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  return getAvailableOperatorOptions(
    query,
    stageIndex,
    column,
    OPERATOR_OPTIONS,
  );
}

export function getOptionByType(optionType: OptionType) {
  return OPERATOR_OPTIONS[optionType];
}

export function getOptionType(
  query: Lib.Query,
  stageIndex: number,
  filterClause?: Lib.FilterClause,
): OptionType {
  if (!filterClause) {
    return "true";
  }

  const filterParts = Lib.booleanFilterParts(query, stageIndex, filterClause);
  if (!filterParts) {
    return "true";
  }

  if (filterParts.operator === "=") {
    return filterParts.values[0] ? "true" : "false";
  } else {
    return filterParts.operator;
  }
}

export function getFilterClause(
  column: Lib.ColumnMetadata,
  optionType: OptionType,
): Lib.ExpressionClause {
  switch (optionType) {
    case "true":
      return Lib.booleanFilterClause({
        operator: "=",
        column,
        values: [true],
      });
    case "false":
      return Lib.booleanFilterClause({
        operator: "=",
        column,
        values: [false],
      });
    case "is-null":
      return Lib.booleanFilterClause({
        operator: "is-null",
        column,
        values: [],
      });
    case "not-null":
      return Lib.booleanFilterClause({
        operator: "not-null",
        column,
        values: [],
      });
  }
}
