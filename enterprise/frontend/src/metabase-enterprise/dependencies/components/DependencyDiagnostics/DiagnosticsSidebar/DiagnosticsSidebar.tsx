import { memo } from "react";

import { Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import type { DependencyDiagnosticsMode } from "../types";

import { BrokenDependentsSection } from "./BrokenDependentsSection";
import S from "./DiagnosticsSidebar.module.css";
import { ErrorsSection } from "./ErrorsSection";
import { FieldsSection } from "./FieldsSection";
import { InfoSection } from "./InfoSection";
import { LocationSection } from "./LocationSection";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarResizableBox } from "./SidebarResizableBox";

type DiagnosticsSidebarProps = {
  node: DependencyNode;
  mode: DependencyDiagnosticsMode;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const DiagnosticsSidebar = memo(function DiagnosticsSidebar({
  node,
  mode,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: DiagnosticsSidebarProps) {
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
        data-testid="dependency-list-sidebar"
      >
        <Stack gap="lg">
          <SidebarHeader node={node} onClose={onClose} />
          <LocationSection node={node} />
          <InfoSection node={node} />
        </Stack>
        {mode === "broken" && <ErrorsSection node={node} />}
        {mode === "broken" && <BrokenDependentsSection node={node} />}
        {mode === "unreferenced" && <FieldsSection node={node} />}
      </Stack>
    </SidebarResizableBox>
  );
});
