import { useMemo } from "react";
import { t } from "ttag";

import { createMockMetadata } from "__support__/metadata";
import { skipToken, useGetTableQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { Box, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { DatabaseId, TableId, Transform } from "metabase-types/api";

import { useTablePreview } from "./useTablePreview";

interface DataTabProps {
  databaseId: DatabaseId | null;
  tableId: TableId | null;
  transform?: Transform;
}

export function DataTab({ databaseId, tableId }: DataTabProps) {
  const { data: table } = useGetTableQuery(
    tableId ? { id: tableId } : skipToken,
  );
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

  const { rawSeries, isFetching, error } = useTablePreview({
    databaseId,
    tableId,
    metadata,
  });

  if (!databaseId || !tableId) {
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
