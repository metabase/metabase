import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrevious } from "react-use";
import { checkNotNull } from "metabase/lib/types";
import type * as Lib from "metabase-lib";
import { getAvailableOperatorOptions } from "../utils";
import { OPTIONS } from "./constants";
import { getOptionType, getFilterClause } from "./utils";

type UseBooleanFilterOpts = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
};

export function useBooleanFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseBooleanFilterOpts) {
  const previousFilter = usePrevious(filter);

  const options = useMemo(
    () => getAvailableOperatorOptions(query, stageIndex, column, OPTIONS),
    [query, stageIndex, column],
  );

  const [optionType, setOptionType] = useState(() =>
    getOptionType(query, stageIndex, filter),
  );

  const setOption = useCallback(
    (type: string) => {
      const option = checkNotNull(options.find(option => option.type === type));
      setOptionType(option.type);
    },
    [options],
  );

  useEffect(() => {
    if (previousFilter && !filter) {
      setOptionType(getOptionType(query, stageIndex));
    }
  }, [query, stageIndex, filter, previousFilter, setOption]);

  return {
    value: optionType,
    options,
    setOption,
    getFilterClause: () => getFilterClause(column, optionType),
  };
}
