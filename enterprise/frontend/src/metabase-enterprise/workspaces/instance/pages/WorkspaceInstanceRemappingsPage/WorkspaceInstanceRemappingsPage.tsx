import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Center, Flex, Stack } from "metabase/ui";
import { useListTableRemappingsQuery } from "metabase-enterprise/api";
import { getDatabasesById } from "metabase-enterprise/workspaces/common/utils";
import type { TableRemappingId } from "metabase-types/api";

import { WorkspaceInstanceHeader } from "../../components/WorkspaceInstanceHeader";

import { RemappingSidebar } from "./RemappingSidebar";
import { RemappingTable } from "./RemappingTable";
import { RemappingsFilterBar } from "./RemappingsFilterBar";
import S from "./WorkspaceInstanceRemappingsPage.module.css";
import { filterRemappings } from "./utils";

export function WorkspaceInstanceRemappingsPage() {
  usePageTitle(t`Workspace`);

  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedRemappingId, setSelectedRemappingId] =
    useState<TableRemappingId>();
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: remappings = [],
    isLoading: isLoadingRemappings,
    error: remappingsError,
  } = useListTableRemappingsQuery();

  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const databases = databasesResponse?.data;
  const databasesById = useMemo(
    () => getDatabasesById(databases ?? []),
    [databases],
  );

  const filteredRemappings = useMemo(
    () => filterRemappings(remappings, databasesById, searchQuery),
    [remappings, databasesById, searchQuery],
  );

  const isLoading = isLoadingRemappings || isLoadingDatabases;
  const error = remappingsError ?? databasesError;

  const selectedRemapping = useMemo(
    () => remappings.find((remapping) => remapping.id === selectedRemappingId),
    [remappings, selectedRemappingId],
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
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="md">
        <WorkspaceInstanceHeader />
        <RemappingsFilterBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
        />
        {isLoading || error != null ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <RemappingTable
            remappings={filteredRemappings}
            databasesById={databasesById}
            selectedRemappingId={selectedRemapping?.id}
            onRemappingSelect={(remapping) =>
              setSelectedRemappingId(remapping.id)
            }
          />
        )}
      </Stack>
      {selectedRemapping != null && (
        <RemappingSidebar
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
