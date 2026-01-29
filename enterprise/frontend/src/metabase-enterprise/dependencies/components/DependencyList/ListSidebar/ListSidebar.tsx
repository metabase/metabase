import { memo } from "react";

import { Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import type { DependencyListMode } from "../types";

import { BrokenDependentsSection } from "./BrokenDependentsSection";
import { ErrorsSection } from "./ErrorsSection";
import { FieldsSection } from "./FieldsSection";
import { SidebarInfoSection } from "./InfoSection";
import S from "./ListSidebar.module.css";
import { LocationSection } from "./LocationSection";
import { SidebarHeader } from "./SidebarHeader";
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
          <LocationSection node={node} />
          <SidebarInfoSection node={node} />
        </Stack>
        {mode === "broken" && <ErrorsSection node={node} />}
        {mode === "broken" && <BrokenDependentsSection node={node} />}
        {mode === "unreferenced" && <FieldsSection node={node} />}
      </Stack>
    </SidebarResizableBox>
  );
});
