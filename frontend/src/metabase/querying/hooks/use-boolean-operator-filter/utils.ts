import {
  getAvailableOperatorOptions,
  getDefaultAvailableOperator,
} from "metabase/querying/utils/filters";
import * as Lib from "metabase-lib";

import { OPERATOR_OPTIONS } from "./constants";
import type { OperatorOption } from "./types";

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

export function getOptionByOperator(operator: Lib.BooleanFilterOperatorName) {
  return OPERATOR_OPTIONS[operator];
}

export function getDefaultOperator(
  availableOptions: OperatorOption[],
): Lib.BooleanFilterOperatorName {
  return getDefaultAvailableOperator(availableOptions, "=");
}

export function getDefaultValues() {
  return [];
}

export function getFilterClause(
  operator: Lib.BooleanFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: boolean[],
) {
  const filterParts = getFilterParts(operator, column, values);
  return filterParts != null ? Lib.booleanFilterClause(filterParts) : undefined;
}

function getFilterParts(
  operator: Lib.BooleanFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: boolean[],
): Lib.BooleanFilterParts | undefined {
  const { valueCount } = OPERATOR_OPTIONS[operator];
  if (values.length !== valueCount) {
    return undefined;
  }

  return {
    operator,
    column,
    values,
  };
}
