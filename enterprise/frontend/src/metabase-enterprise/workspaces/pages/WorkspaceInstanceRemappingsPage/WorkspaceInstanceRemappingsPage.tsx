import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Center, Flex, Stack } from "metabase/ui";
import {
  useGetCurrentWorkspaceQuery,
  useListWorkspaceRemappingsQuery,
} from "metabase-enterprise/api";
import type { WorkspaceRemappingId } from "metabase-types/api";

import { WorkspaceInstanceHeader } from "../../components/WorkspaceInstanceHeader";
import { WorkspaceRemappingSidebar } from "../../components/WorkspaceRemappingSidebar";
import { WorkspaceRemappingsTable } from "../../components/WorkspaceRemappingsTable";
import { toDatabasesById } from "../../utils";

import S from "./WorkspaceInstanceRemappingsPage.module.css";

export function WorkspaceInstanceRemappingsPage() {
  usePageTitle(t`Workspace`);

  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedRemappingId, setSelectedRemappingId] =
    useState<WorkspaceRemappingId>();

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

  const selectedRemapping = remappings.find(
    (remapping) => remapping.id === selectedRemappingId,
  );

  useLayoutEffect(() => {
    if (selectedRemappingId != null && selectedRemapping == null) {
      setSelectedRemappingId(undefined);
    }
  }, [selectedRemappingId, selectedRemapping]);

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
      data-testid="workspace-instance-remappings"
    >
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="lg">
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
            selectedRemappingId={selectedRemappingId}
            onRemappingSelect={(remapping) =>
              setSelectedRemappingId(remapping.id)
            }
          />
        )}
      </Stack>
      {selectedRemapping != null && (
        <WorkspaceRemappingSidebar
          remapping={selectedRemapping}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedRemappingId(undefined)}
        />
      )}
    </Flex>
  );
}
