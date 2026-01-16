import { memo } from "react";

import { Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import S from "./ListSidebar.module.css";
import { SidebarCreationInfo } from "./SidebarCreationInfo";
import { SidebarDependentsInfo } from "./SidebarDependentsInfo";
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
      className={S.sidebar}
      p="lg"
      w="25rem"
      gap="xl"
      bg="background-primary"
      data-testid="dependency-list-sidebar"
    >
      <Stack gap="lg">
        <SidebarHeader node={node} onClose={onClose} />
        <SidebarLocationInfo node={node} />
        <SidebarCreationInfo node={node} />
      </Stack>
      {errorGroups.map((errorGroup) => (
        <SidebarErrorInfo
          key={errorGroup.type}
          type={errorGroup.type}
          errors={errorGroup.errors}
        />
      ))}
      <SidebarDependentsInfo node={node} />
    </Stack>
  );
});
