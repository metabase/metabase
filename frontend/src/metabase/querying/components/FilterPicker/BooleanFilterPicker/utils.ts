import * as Lib from "metabase-lib";
import type { OptionType } from "./types";

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
