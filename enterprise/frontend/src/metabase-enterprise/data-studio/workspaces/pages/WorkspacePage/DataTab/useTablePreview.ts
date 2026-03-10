import { useMemo } from "react";
import _ from "underscore";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  DatabaseId,
  DatasetQuery,
  RawSeries,
  TableId,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

interface UseTableQuestionProps {
  databaseId: DatabaseId | null;
  tableId: TableId | null;
  metadata: Metadata;
  last_transform_run_time?: string | null;
  query?: DatasetQuery;
}

interface UseTablePreviewResult {
  rawSeries?: RawSeries;
  isFetching: boolean;
  isLoading: boolean;
  isError: boolean;
  error?: string;
}

export function useTablePreview({
  databaseId,
  tableId,
  metadata,
  last_transform_run_time,
  query,
}: UseTableQuestionProps): UseTablePreviewResult {
  const metadataProvider =
    Object.keys(metadata.tables).length > 0
      ? Lib.metadataProvider(databaseId, metadata)
      : null;

  const table =
    metadataProvider && tableId
      ? Lib.tableOrCardMetadata(metadataProvider, tableId)
      : null;

  const tableBasedQuery =
    table && metadataProvider
      ? Lib.queryFromTableOrCardMetadata(metadataProvider, table)
      : null;
  const queryToFetch = query || tableBasedQuery;

  const { data, ...rest } = useGetAdhocQueryQuery(
    queryToFetch == null
      ? skipToken
      : query
        ? {
            ...query,
            ignore_error: true,
            _refetchDeps: last_transform_run_time,
          }
        : tableBasedQuery
          ? {
              ...Lib.toJsQuery(tableBasedQuery),
              ignore_error: true,
              _refetchDeps: last_transform_run_time,
            }
          : skipToken,
  );

  const base = {
    ...rest,
    error: rest.error ? getErrorMessage(rest.error) : undefined,
    rawSeries: undefined,
  };

  const rawSeries = useMemo<RawSeries>(
    () =>
      queryToFetch != null && data
        ? [
            {
              card: createMockCard({
                display: "table",
                visualization_settings: {},
              }),
              data: {
                ...data.data,
                rows: _.uniq(data.data.rows ?? []),
              },
            },
          ]
        : [],
    [data, queryToFetch],
  );

  if (data?.status === "failed") {
    return { ...base, isError: true, error: getErrorMessage(data) };
  }

  if (queryToFetch == null || !data?.data || data.data.cols.length === 0) {
    return base;
  }

  return { ...base, rawSeries };
}
