import { useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Center, Flex, Stack } from "metabase/ui";
import {
  useGetCurrentWorkspaceQuery,
  useListWorkspaceRemappingsQuery,
} from "metabase-enterprise/api";
import type { Database, DatabaseId } from "metabase-types/api";

import { WorkspaceRemappingsTable } from "../WorkspaceRemappingsTable";

import S from "./WorkspaceInstance.module.css";
import { WorkspaceInstanceHeader } from "./WorkspaceInstanceHeader";

export function WorkspaceInstance() {
  usePageTitle(t`Workspace`);

  const {
    data: workspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useGetCurrentWorkspaceQuery();

  const {
    data: remappings = [],
    isLoading: isLoadingRemappings,
    error: remappingsError,
  } = useListWorkspaceRemappingsQuery();

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
    isLoadingWorkspace || isLoadingRemappings || isLoadingDatabases;
  const error = workspaceError ?? remappingsError ?? databasesError;

  return (
    <Flex h="100%" wrap="nowrap" data-testid="workspace-instance">
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="md">
        <WorkspaceInstanceHeader workspaceName={workspace?.name} />
        {isLoading || error != null || workspace == null ? (
          <Center h="100%">
            <LoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <WorkspaceRemappingsTable
            remappings={remappings}
            databasesById={databasesById}
            workspaceDatabases={workspace.databases}
          />
        )}
      </Stack>
    </Flex>
  );
}

function toDatabasesById(databases: Database[]): Map<DatabaseId, Database> {
  const map = new Map<DatabaseId, Database>();
  for (const database of databases) {
    map.set(database.id, database);
  }
  return map;
}
