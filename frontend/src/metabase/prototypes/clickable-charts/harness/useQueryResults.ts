import { useMemo } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import * as Lib from "metabase-lib";
import type {
  CardDisplayType,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

type UseQueryResultsOpts = {
  query: Lib.Query;
  display: CardDisplayType;
  settings?: VisualizationSettings;
};

type QueryResultsState = {
  /** `undefined` until the first result lands, or when the query failed. */
  rawSeries: RawSeries | undefined;
  isFetching: boolean;
  error: string | undefined;
};

/**
 * Runs the query ad hoc and shapes the result as the single-card `RawSeries`
 * that `Visualization` (and the charts underneath it) consume.
 */
export function useQueryResults({
  query,
  display,
  settings = {},
}: UseQueryResultsOpts): QueryResultsState {
  const jsQuery = useMemo(() => Lib.toJsQuery(query), [query]);
  const result = useGetAdhocQueryQuery({ ...jsQuery, ignore_error: true });

  const rawSeries = useMemo<RawSeries | undefined>(() => {
    if (!result.data?.data || result.data.data.cols.length === 0) {
      return undefined;
    }
    return [
      {
        card: createMockCard({
          dataset_query: jsQuery,
          display,
          visualization_settings: settings,
        }),
        data: result.data.data,
      },
    ];
  }, [result.data, jsQuery, display, settings]);

  const error =
    result.error != null
      ? getErrorMessage(result.error)
      : result.data?.status === "failed"
        ? (result.data.error ?? "Query failed")
        : undefined;

  return {
    rawSeries,
    isFetching: result.isFetching,
    error: error == null ? undefined : String(error),
  };
}
