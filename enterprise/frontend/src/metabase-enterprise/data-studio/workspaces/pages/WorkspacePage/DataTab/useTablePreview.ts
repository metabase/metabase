import { useMemo } from "react";
import _ from "underscore";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useSelector } from "metabase/lib/redux";
import { getTableMetadataQuery } from "metabase/metadata/pages/shared";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type { DatabaseId, RawSeries, TableId } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

interface UseTableQuestionProps {
  databaseId: DatabaseId | null;
  tableId: TableId | null;
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
}: UseTableQuestionProps): UseTablePreviewResult {
  const metadata = useSelector(getMetadata);
  // Need to fetch this to make sure metadata is populated with proper table information on
  // initial page load.
  useGetTableQueryMetadataQuery(
    tableId && tableId in metadata.tables
      ? skipToken
      : getTableMetadataQuery(tableId),
  );

  const metadataProvider =
    Object.keys(metadata.tables).length > 0
      ? Lib.metadataProvider(databaseId, metadata)
      : null;

  const table =
    metadataProvider && tableId
      ? Lib.tableOrCardMetadata(metadataProvider, tableId)
      : null;

  const query =
    table && metadataProvider
      ? Lib.queryFromTableOrCardMetadata(metadataProvider, table)
      : null;

  const { data, refetch, ...rest } = useGetAdhocQueryQuery(
    query == null
      ? skipToken
      : {
          ...Lib.toJsQuery(query),
          ignore_error: true,
        },
  );
  const base = {
    ...rest,
    error: rest.error ? getErrorMessage(rest.error) : undefined,
    rawSeries: undefined,
  };

  const rawSeries = useMemo(
    () =>
      query
        ? [
            {
              card: createMockCard({
                dataset_query: Lib.toJsQuery(query),
                display: "table",
                visualization_settings: {},
              }),
              data: {
                ...data?.data,
                rows: _.uniq(data?.data?.rows ?? []),
              },
            },
          ]
        : ([] as RawSeries),
    [data?.data, query],
  );

  if (data?.status === "failed") {
    return { ...base, isError: true, error: getErrorMessage(data) };
  }

  if (query == null || !data?.data || data.data.cols.length === 0) {
    return base;
  }

  return { ...base, rawSeries };
}
