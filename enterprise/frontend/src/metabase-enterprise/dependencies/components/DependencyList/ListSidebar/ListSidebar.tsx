import { memo } from "react";

import { Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getDependencyErrorGroups, getDependencyErrors } from "../../../utils";

import S from "./ListSidebar.module.css";
import { SidebarCreationInfo } from "./SidebarCreationInfo";
import { SidebarDependentsInfo } from "./SidebarDependentsInfo";
import { SidebarErrorInfo } from "./SidebarErrorInfo";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarLocationInfo } from "./SidebarLocationInfo";
import { SidebarTransformInfo } from "./SidebarTransformInfo";

type ListSidebarProps = {
  node: DependencyNode;
  onClose: () => void;
};

export const ListSidebar = memo(function ListSidebar({
  node,
  onClose,
}: ListSidebarProps) {
  const errors = getDependencyErrors(node.dependents_errors ?? []);
  const errorGroups = getDependencyErrorGroups(errors);

  return (
    <Stack
      className={S.sidebar}
      p="lg"
      w="32rem"
      gap="xl"
      bg="background-primary"
      data-testid="dependency-list-sidebar"
    >
      <Stack gap="lg">
        <SidebarHeader node={node} onClose={onClose} />
        <SidebarLocationInfo node={node} />
        <SidebarTransformInfo node={node} />
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
