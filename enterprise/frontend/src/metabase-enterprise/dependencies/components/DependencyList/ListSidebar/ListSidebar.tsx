import { memo } from "react";

import { Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getDependencyErrorGroups, getDependencyErrors } from "../../../utils";

import S from "./ListSidebar.module.css";
import { SidebarCreationSection } from "./SidebarCreationSection";
import { SidebarDependentsSection } from "./SidebarDependentsSection";
import { SidebarErrorSection } from "./SidebarErrorSection";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarLocationSection } from "./SidebarLocationSection";
import { SidebarResizableBox } from "./SidebarResizableBox";
import { SidebarTransformSection } from "./SidebarTransformSection";

type ListSidebarProps = {
  node: DependencyNode;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const ListSidebar = memo(function ListSidebar({
  node,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: ListSidebarProps) {
  const errors = getDependencyErrors(node.dependents_errors ?? []);
  const errorGroups = getDependencyErrorGroups(errors);

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
          <SidebarTransformSection node={node} />
          <SidebarCreationSection node={node} />
        </Stack>
        {errorGroups.map((errorGroup) => (
          <SidebarErrorSection
            key={errorGroup.type}
            type={errorGroup.type}
            errors={errorGroup.errors}
          />
        ))}
        <SidebarDependentsSection node={node} />
      </Stack>
    </SidebarResizableBox>
  );
});
