import { useMemo, useState } from "react";
import { t } from "ttag";

import { createMockMetadata } from "__support__/metadata";
import { skipToken, useGetTableQuery } from "metabase/api";
import { AnsiLogs } from "metabase/common/components/AnsiLogs";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { Box, Group, Icon, Stack, Tabs, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { useGetWorkspaceTransformQuery } from "metabase-enterprise/api";
import { ExecutionOutputTable } from "metabase-enterprise/transforms-python/components/PythonTransformEditor/PythonEditorResults/ExecutionOutputTable";
import type {
  DatabaseId,
  DatasetQuery,
  TableId,
  TestPythonTransformResponse,
} from "metabase-types/api";

import { useTablePreview } from "./useTablePreview";

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

  if (pythonPreviewResult) {
    return <PythonPreviewResults executionResult={pythonPreviewResult} />;
  }

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

type ResultsTab = "results" | "output";

function PythonPreviewResults({
  executionResult,
}: {
  executionResult: TestPythonTransformResponse;
}) {
  const [tab, setTab] = useState<ResultsTab>("results");

  return (
    <Stack gap={0} h="100%">
      <Box
        p="sm"
        style={{
          borderBottom: "1px solid var(--mb-color-border)",
        }}
      >
        <Tabs
          value={tab}
          onChange={(value) => {
            if (value) {
              setTab(value as ResultsTab);
            }
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="results">{t`Results`}</Tabs.Tab>
            <Tabs.Tab value="output">{t`Output`}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Box>

      {tab === "results" &&
        (executionResult?.error ? (
          <ErrorState error={executionResult.error.message} />
        ) : (
          <Box h="100%" style={{ overflow: "auto" }}>
            <ExecutionOutputTable output={executionResult?.output} />
          </Box>
        ))}

      {tab === "output" && (
        <Box
          fz="sm"
          p="md"
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
            <Text
              c="text-tertiary"
              fz="sm"
              fs="italic"
            >{t`No logs to display`}</Text>
          )}
        </Box>
      )}
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
