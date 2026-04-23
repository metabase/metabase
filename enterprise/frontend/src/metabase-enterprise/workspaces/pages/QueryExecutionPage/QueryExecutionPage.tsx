import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  useListDatabasesQuery,
  useListQueryExecutionsQuery,
} from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Center, Flex, Stack } from "metabase/ui";
import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";
import type { QueryExecutionId } from "metabase-types/api";

import { WorkspaceInstanceHeader } from "../../components/WorkspaceInstanceHeader";
import { toDatabasesById } from "../../utils";

import S from "./QueryExecutionPage.module.css";
import { QueryExecutionSidebar } from "./QueryExecutionSidebar";
import { QueryExecutionTable } from "./QueryExecutionTable";

export function QueryExecutionPage() {
  usePageTitle(t`Workspace`);

  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedId, setSelectedId] = useState<QueryExecutionId>();

  const {
    data: workspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useGetCurrentWorkspaceQuery();

  const {
    data: executions = [],
    isLoading: isLoadingExecutions,
    error: executionsError,
  } = useListQueryExecutionsQuery();

  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const databasesById = useMemo(
    () => toDatabasesById(databasesResponse?.data ?? []),
    [databasesResponse],
  );

  const isLoading =
    isLoadingWorkspace || isLoadingExecutions || isLoadingDatabases;
  const error = workspaceError ?? executionsError ?? databasesError;

  const selectedExecution = executions.find(
    (execution) => execution.id === selectedId,
  );

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
      data-testid="query-execution-page"
    >
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="lg">
        <WorkspaceInstanceHeader workspaceName={workspace?.name} />
        {isLoading || error != null ? (
          <Center h="100%">
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <QueryExecutionTable
            executions={executions}
            databasesById={databasesById}
            selectedId={selectedId}
            onSelect={(execution) => setSelectedId(execution.id)}
          />
        )}
      </Stack>
      {selectedExecution != null && (
        <QueryExecutionSidebar
          execution={selectedExecution}
          database={databasesById.get(selectedExecution.database_id)}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedId(undefined)}
        />
      )}
    </Flex>
  );
}
