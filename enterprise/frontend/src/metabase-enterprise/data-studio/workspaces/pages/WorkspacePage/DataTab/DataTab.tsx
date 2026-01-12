import { useMemo } from "react";
import { t } from "ttag";

import { createMockMetadata } from "__support__/metadata";
import { skipToken, useGetTableQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { Box, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { useGetWorkspaceTransformQuery } from "metabase-enterprise/api";
import type { DatabaseId, DatasetQuery, TableId } from "metabase-types/api";

import { useTablePreview } from "./useTablePreview";

interface DataTabProps {
  workspaceId: number;
  databaseId: DatabaseId | null;
  tableId: TableId | null;
  transformId?: string;
  query?: DatasetQuery;
}

export function DataTab({
  workspaceId,
  databaseId,
  tableId,
  transformId,
  query,
}: DataTabProps) {
  const { data: table } = useGetTableQuery(
    tableId && !query ? { id: tableId } : skipToken,
  );
  const { data: transform } = useGetWorkspaceTransformQuery(
    transformId ? { workspaceId, transformId } : skipToken,
  );

  // Use existing table preview logic when no query
  const metadata = useMemo(
    () =>
      createMockMetadata({
        tables: table
          ? [
              {
                ...table,
                visibility_type: null,
              },
            ]
          : [],
      }),
    [table],
  );

  const tablePreviewResult = useTablePreview({
    databaseId,
    tableId,
    metadata,
    last_transform_run_time: transform?.last_run_at,
    query,
  });
  const { rawSeries, isFetching, error } = tablePreviewResult;

  if (!databaseId || (!tableId && !query)) {
    return (
      <Stack h="100%" align="center" justify="center">
        <Text c="text-medium">{t`Select a table to view its data`}</Text>
      </Stack>
    );
  }

  if (isFetching) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (error) {
    return (
      <Stack h="100%" align="center" justify="center">
        <Text c="error">{t`Error loading data`}</Text>
      </Stack>
    );
  }

  if (!rawSeries) {
    return (
      <Stack h="100%" align="center" justify="center">
        <Text c="text-medium">{t`No data available`}</Text>
      </Stack>
    );
  }

  return (
    <Box h="100%" className={CS.relative}>
      <Visualization queryBuilderMode="dataset" rawSeries={rawSeries} />
    </Box>
  );
}
