import { useEffect, useMemo, useState } from "react";

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

  const defaultOptionType = useMemo(() => {
    return getOptionType(query, stageIndex, filter);
  }, [query, stageIndex, filter]);
  const [optionType, setOptionType] = useState(defaultOptionType);

  const { isAdvanced } = getOptionByType(optionType);
  const [isExpanded, setIsExpanded] = useState(isAdvanced);

  const visibleOptions = useMemo(
    () =>
      isExpanded
        ? availableOptions
        : availableOptions.filter(option => !option.isAdvanced),
    [availableOptions, isExpanded],
  );

  useEffect(() => {
    const { isAdvanced } = getOptionByType(defaultOptionType);
    setOptionType(defaultOptionType);
    setIsExpanded(isAdvanced);
  }, [defaultOptionType]);

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
