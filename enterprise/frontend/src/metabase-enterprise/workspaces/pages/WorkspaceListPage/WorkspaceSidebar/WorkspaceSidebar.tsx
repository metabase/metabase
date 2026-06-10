import { memo } from "react";

import { Stack } from "metabase/ui";
import { SidebarResizableBox } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/SidebarResizableBox";
import type { Workspace } from "metabase-types/api";

import { SidebarHeader } from "./SidebarHeader/SidebarHeader";
import S from "./WorkspaceSidebar.module.css";

type WorkspaceSidebarProps = {
  workspace: Workspace;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const WorkspaceSidebar = memo(function WorkspaceSidebar({
  workspace,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: WorkspaceSidebarProps) {
  return (
    <SidebarResizableBox
      containerWidth={containerWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      <Stack
        className={S.sidebar}
        p="lg"
        gap="lg"
        bg="background-primary"
        data-testid="workspace-sidebar"
      >
        <SidebarHeader workspace={workspace} onClose={onClose} />
      </Stack>
    </SidebarResizableBox>
  );
});
