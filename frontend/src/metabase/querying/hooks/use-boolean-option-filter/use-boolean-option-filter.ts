import { useMemo, useState } from "react";

import type * as Lib from "metabase-lib";

import {
  getAvailableOptions,
  getFilterClause,
  getOptionByType,
  getOptionType,
} from "./utils";

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
    () => getAvailableOptions(query, stageIndex, column),
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
