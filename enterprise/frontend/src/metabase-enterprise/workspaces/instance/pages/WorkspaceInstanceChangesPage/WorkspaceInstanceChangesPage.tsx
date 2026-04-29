import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Center, Flex, Stack } from "metabase/ui";
import { useGetWorkspaceChangeSummaryQuery } from "metabase-enterprise/api";
import type { TableRemappingId, WorkspaceDivergedTable } from "metabase-types/api";

import { WorkspaceInstanceHeader } from "../../components/WorkspaceInstanceHeader";

import { DivergedTableSidebar } from "./DivergedTableSidebar";
import { DivergedTablesSection } from "./DivergedTablesSection";
import S from "./WorkspaceInstanceChangesPage.module.css";

export function WorkspaceInstanceChangesPage() {
  usePageTitle(t`Workspace`);

  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedTableId, setSelectedTableId] = useState<TableRemappingId>();

  const {
    data: changeSummary,
    isLoading,
    error,
  } = useGetWorkspaceChangeSummaryQuery();

  const tables = changeSummary?.diverged_tables ?? [];

  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId),
    [tables, selectedTableId],
  );

  useLayoutEffect(() => {
    if (selectedTableId != null && selectedTable == null) {
      setSelectedTableId(undefined);
    }
  }, [selectedTableId, selectedTable]);

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
      data-testid="workspace-instance-changes"
    >
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="md">
        <WorkspaceInstanceHeader />
        {isLoading || error != null || changeSummary == null ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <DivergedTablesSection
            tables={changeSummary.diverged_tables}
            selectedTableId={selectedTable?.id}
            onTableSelect={(table: WorkspaceDivergedTable) =>
              setSelectedTableId(table.id)
            }
          />
        )}
      </Stack>
      {selectedTable != null && (
        <DivergedTableSidebar
          table={selectedTable}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedTableId(undefined)}
        />
      )}
    </Flex>
  );
}
