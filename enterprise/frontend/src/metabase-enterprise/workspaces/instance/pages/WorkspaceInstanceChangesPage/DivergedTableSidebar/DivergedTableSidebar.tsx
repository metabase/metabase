import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { Stack, Title } from "metabase/ui";
import { SidebarResizableBox } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/SidebarResizableBox";
import type { WorkspaceDivergedTable } from "metabase-types/api";

import { AffectedItemsList } from "./AffectedItemsList";
import S from "./DivergedTableSidebar.module.css";
import { SidebarHeader } from "./SidebarHeader";

type DivergedTableSidebarProps = {
  table: WorkspaceDivergedTable;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export function DivergedTableSidebar({
  table,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: DivergedTableSidebarProps) {
  return (
    <SidebarResizableBox
      containerWidth={containerWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      <Stack
        className={S.sidebar}
        p="lg"
        gap="xl"
        bg="background-primary"
        data-testid="diverged-table-sidebar"
      >
        <SidebarHeader table={table} onClose={onClose} />
        <Stack gap="sm">
          <Title order={5}>{t`Affected items`}</Title>
          {table.dependents.length === 0 ? (
            <ListEmptyState
              label={t`Nothing uses this table.`}
            />
          ) : (
            <AffectedItemsList table={table} />
          )}
        </Stack>
      </Stack>
    </SidebarResizableBox>
  );
}
