import { useMemo, useState } from "react";
import { getAvailableOperatorOptions } from "metabase/querying/utils/filters";
import type * as Lib from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";
import { getFilterClause, getOptionByType, getOptionType } from "./utils";

type UseBooleanOptionFilterProps = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
};

export function useBooleanOptionFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseBooleanOptionFilterProps) {
  const availableOptions = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [optionType, setOptionType] = useState(() =>
    getOptionType(query, stageIndex, filter),
  );

  const isAdvanced = getOptionByType(optionType).isAdvanced;
  const [isExpanded, setIsExpanded] = useState(() => isAdvanced);

  const visibleOptions = useMemo(
    () =>
      isExpanded
        ? availableOptions
        : availableOptions.filter(option => !option.isAdvanced),
    [availableOptions, isExpanded],
  );

  return {
    optionType,
    isAdvanced,
    isExpanded,
    visibleOptions,
    getFilterClause: () => getFilterClause(column, optionType),
    setOptionType,
    setIsExpanded,
  };
}
