import { useMemo, useState } from "react";
import { t } from "ttag";

import { createMockMetadata } from "__support__/metadata";
import { skipToken, useGetTableQuery } from "metabase/api";
import { AnsiLogs } from "metabase/common/components/AnsiLogs";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { Box, Group, Icon, Stack, Tabs } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { useGetWorkspaceTransformQuery } from "metabase-enterprise/api";
import { ExecutionOutputTable } from "metabase-enterprise/transforms-python/components/PythonTransformEditor/PythonEditorResults/ExecutionOutputTable";
import type {
  DatabaseId,
  DatasetQuery,
  TableId,
  TestPythonTransformResponse,
} from "metabase-types/api";

import S from "./DataTab.module.css";
import { useTablePreview } from "./useTablePreview";
import { useTransformDryRunPreview } from "./useTransformDryRunPreview";

interface DataTabProps {
  workspaceId: number;
  databaseId: DatabaseId | null;
  tableId: TableId | null;
  transformId?: string;
  query?: DatasetQuery;
  pythonPreviewResult?: any;
}

export function DataTab({
  workspaceId,
  databaseId,
  tableId,
  transformId,
  query,
  pythonPreviewResult,
}: DataTabProps) {
  const {
    data: table,
    error: tableError,
    isLoading: tableIsLoading,
  } = useGetTableQuery(tableId && !query ? { id: tableId } : skipToken);
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

  // we want to use /dataset for table preview
  const shouldUseDryRunPreview = Boolean(query && transformId && workspaceId);
  const tablePreviewResult = useTablePreview({
    databaseId,
    tableId: shouldUseDryRunPreview ? null : tableId,
    metadata,
    last_transform_run_time: transform?.last_run_at,
    query: shouldUseDryRunPreview ? undefined : query,
  });
  const dryRunPreviewResult = useTransformDryRunPreview({
    workspaceId,
    transformId: shouldUseDryRunPreview ? transformId : undefined,
    query: shouldUseDryRunPreview ? query : undefined,
  });
  const previewResult = shouldUseDryRunPreview
    ? dryRunPreviewResult
    : tablePreviewResult;
  const { rawSeries, isFetching, error: previewResultError } = previewResult;

  const error = tableError || previewResultError;
  const isLoading = tableIsLoading || isFetching;

  if (pythonPreviewResult) {
    return <PythonPreviewResults executionResult={pythonPreviewResult} />;
  }

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  if (!databaseId || (!tableId && !query)) {
    return (
      <Stack p="md">
        <EmptyState message={t`Select a table to view its data`} />
      </Stack>
    );
  }

  if (!rawSeries) {
    return (
      <Stack p="md">
        <EmptyState message={t`No data available`} />
      </Stack>
    );
  }

  return (
    <Box h="100%" className={CS.relative}>
      <Visualization queryBuilderMode="dataset" rawSeries={rawSeries} />
    </Box>
  );
}

function PythonPreviewResults({
  executionResult,
}: {
  executionResult: TestPythonTransformResponse;
}) {
  const [tab, setTab] = useState<string>("results");

  return (
    <Stack gap={0} h="100%">
      <Tabs
        h="100%"
        value={tab}
        onChange={(newTab) => {
          if (newTab) {
            setTab(newTab);
          }
        }}
      >
        <Tabs.List className={S.tabsPanel} px="md">
          <Tabs.Tab value="results">{t`Results`}</Tabs.Tab>
          <Tabs.Tab value="output">{t`Output`}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel h="100%" p="md" value="results">
          {executionResult?.error ? (
            <ErrorState error={executionResult.error.message} />
          ) : (
            <Box h="100%" style={{ overflow: "auto" }}>
              <ExecutionOutputTable output={executionResult?.output} />
            </Box>
          )}
        </Tabs.Panel>

        <Tabs.Panel bg="background-secondary" h="100%" p="md" value="output">
          <Box
            fz="sm"
            h="100%"
            style={{
              whiteSpace: "pre",
              fontFamily: "var(--mb-default-monospace-font-family)",
              overflow: "auto",
            }}
          >
            {executionResult?.logs ? (
              <AnsiLogs>{executionResult.logs}</AnsiLogs>
            ) : (
              <EmptyState message={t`No logs to display`} />
            )}
          </Box>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <Stack gap="sm" h="100%" p="md" c="error">
      <Group fw="bold" gap="sm">
        <Icon name="warning" />
        {t`Error`}
      </Group>
      <Box fz="sm">{error}</Box>
    </Stack>
  );
}
