import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Center, Flex, Stack, Title } from "metabase/ui";
import { useListWorkspaceRemappingsQuery } from "metabase-enterprise/api";
import type { WorkspaceRemappingId } from "metabase-types/api";

import { toDatabasesById } from "../../utils";

import { WorkspaceRemappingSidebar } from "./WorkspaceRemappingSidebar";
import { WorkspaceRemappingsTable } from "./WorkspaceRemappingsTable";
import S from "./WorkspacesTableRemappingsPage.module.css";

export function WorkspacesTableRemappingsPage() {
  usePageTitle(t`Table remappings`);

  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedRemappingId, setSelectedRemappingId] =
    useState<WorkspaceRemappingId>();

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

  const databases = databasesResponse?.data;
  const databasesById = useMemo(
    () => toDatabasesById(databases ?? []),
    [databases],
  );

  const isLoading = isLoadingRemappings || isLoadingDatabases;
  const error = remappingsError ?? databasesError;

  const selectedRemapping = useMemo(
    () => remappings.find((remapping) => remapping.id === selectedRemappingId),
    [remappings, selectedRemappingId],
  );

  return (
    <Flex
      className={cx(S.container, { [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      w="100%"
      wrap="nowrap"
      data-testid="workspaces-table-remappings"
    >
      <Stack
        className={S.main}
        flex={1}
        miw={0}
        mih={0}
        h="100%"
        py="2rem"
        pl="2rem"
        pr={selectedRemapping == null ? "2rem" : "lg"}
        gap="lg"
      >
        <Title order={1}>{t`Table remappings`}</Title>
        {isLoading || error != null ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <WorkspaceRemappingsTable
            remappings={remappings}
            databasesById={databasesById}
            selectedRemappingId={selectedRemapping?.id}
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
