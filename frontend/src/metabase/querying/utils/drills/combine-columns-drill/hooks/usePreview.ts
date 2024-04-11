import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { getQueryResults } from "metabase/query_builder/selectors";
import type * as Lib from "metabase-lib";
import type { RowValue } from "metabase-types/api";

import { extractQueryResults, getPreview } from "../utils";

interface Preview {
  error?: unknown;
  preview: { color: string; value: RowValue }[];
}

export const usePreview = (
  query: Lib.Query,
  stageIndex: number,
  expressionClause: Lib.ExpressionClause,
): Preview => {
  const datasets = useSelector(getQueryResults);

  const queryResults = useMemo(
    () => extractQueryResults(query, stageIndex, datasets),
    [query, stageIndex, datasets],
  );

  return useMemo(() => {
    const { columns, rows } = queryResults;

    try {
      return {
        preview: getPreview(query, stageIndex, expressionClause, columns, rows),
      };
    } catch (error) {
      return {
        error,
        preview: [],
      };
    }
  }, [query, stageIndex, expressionClause, queryResults]);
};
