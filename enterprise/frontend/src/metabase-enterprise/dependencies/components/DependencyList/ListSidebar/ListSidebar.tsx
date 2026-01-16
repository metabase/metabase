import { memo } from "react";

import { Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import S from "./ListSidebar.module.css";
import { SidebarCreationInfo } from "./SidebarCreationInfo";
import { SidebarErrorInfo } from "./SidebarErrorInfo";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarLocationInfo } from "./SidebarLocationInfo";
import { getDependencyErrorGroups } from "./utils";

type ListSidebarProps = {
  node: DependencyNode;
  onClose: () => void;
};

export const ListSidebar = memo(function ListSidebar({
  node,
  onClose,
}: ListSidebarProps) {
  const errorGroups = getDependencyErrorGroups(node.dependents_errors ?? []);

  return (
    <Stack
      className={S.panel}
      p="lg"
      w="25rem"
      gap="lg"
      data-testid="dependency-list-sidebar"
    >
      <SidebarHeader node={node} onClose={onClose} />
      <SidebarCreationInfo node={node} />
      <SidebarLocationInfo node={node} />
      {errorGroups.map((errorGroup) => (
        <SidebarErrorInfo
          key={errorGroup.type}
          type={errorGroup.type}
          errors={errorGroup.errors}
        />
      ))}
    </Stack>
  );
});
