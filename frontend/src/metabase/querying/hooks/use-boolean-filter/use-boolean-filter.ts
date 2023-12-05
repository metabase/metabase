import { useCallback, useMemo, useState } from "react";
import { checkNotNull } from "metabase/lib/types";
import type * as Lib from "metabase-lib";
import { getAvailableOperatorOptions } from "../use-filter-operator";
import { OPTIONS } from "./constants";
import { getFilterClause, getOptionByType, getOptionType } from "./utils";

type UseBooleanFilterOpts = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange?: (lib: Lib.ExpressionClause) => void;
};

export function useBooleanFilter({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: UseBooleanFilterOpts) {
  const availableOptions = useMemo(
    () => getAvailableOperatorOptions(query, stageIndex, column, OPTIONS),
    [query, stageIndex, column],
  );

  const [optionType, setOptionType] = useState(() =>
    getOptionType(query, stageIndex, filter),
  );

  const isAdvanced = getOptionByType(optionType).isAdvanced;
  const [isExpanded, setIsExpanded] = useState(() => isAdvanced);

  const handleOptionChange = useCallback(
    (type: string) => {
      const option = checkNotNull(
        availableOptions.find(option => option.type === type),
      );
      setOptionType(option.type);
      setIsExpanded(isExpanded => isExpanded || option.isAdvanced);

      if (onChange) {
        onChange(getFilterClause(column, option.type));
      }
    },
    [column, availableOptions, onChange],
  );

  return {
    optionType,
    isAdvanced,
    isExpanded,
    availableOptions,
    getFilterClause: () => getFilterClause(column, optionType),
    handleOptionChange,
    handleIsExpandedChange: setIsExpanded,
  };
}
