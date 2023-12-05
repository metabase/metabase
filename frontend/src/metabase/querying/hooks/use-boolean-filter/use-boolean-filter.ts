import { useCallback, useMemo, useState } from "react";
import { checkNotNull } from "metabase/lib/types";
import type * as Lib from "metabase-lib";
import { getAvailableOperatorOptions } from "../utils";
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
  const options = useMemo(
    () => getAvailableOperatorOptions(query, stageIndex, column, OPTIONS),
    [query, stageIndex, column],
  );

  const [optionType, setOptionType] = useState(() =>
    getOptionType(query, stageIndex, filter),
  );

  const isAdvanced = getOptionByType(optionType).isAdvanced;
  const [isExpanded, setIsExpanded] = useState(() => isAdvanced);

  const handleOptionTypeChange = useCallback(
    (type: string) => {
      const option = checkNotNull(options.find(option => option.type === type));
      setOptionType(option.type);
      if (option.isAdvanced) {
        setIsExpanded(true);
      }
      if (onChange) {
        onChange(getFilterClause(column, option.type));
      }
    },
    [column, options, onChange],
  );

  return {
    options,
    optionType,
    isAdvanced,
    isExpanded,
    getFilterClause: () => getFilterClause(column, optionType),
    handleOptionTypeChange,
    handleIsExpandedChange: setIsExpanded,
  };
}
