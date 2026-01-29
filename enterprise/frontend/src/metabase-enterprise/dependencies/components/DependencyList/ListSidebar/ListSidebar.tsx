import { memo } from "react";

import { Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import type { DependencyListMode } from "../types";

import S from "./ListSidebar.module.css";
import { SidebarDependentsSection } from "./SidebarDependentsSection";
import { SidebarErrorSection } from "./SidebarErrorSection";
import { SidebarFieldsSection } from "./SidebarFieldsSection";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarInfoSection } from "./SidebarInfoSection";
import { SidebarLocationSection } from "./SidebarLocationSection";
import { SidebarResizableBox } from "./SidebarResizableBox";

type ListSidebarProps = {
  node: DependencyNode;
  mode: DependencyListMode;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const ListSidebar = memo(function ListSidebar({
  node,
  mode,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: ListSidebarProps) {
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
          <SidebarLocationSection node={node} />
          <SidebarInfoSection node={node} />
        </Stack>
        {mode === "broken" && <SidebarErrorSection node={node} />}
        {mode === "unreferenced" && <SidebarFieldsSection node={node} />}
        <SidebarDependentsSection node={node} />
      </Stack>
    </SidebarResizableBox>
  );
});
