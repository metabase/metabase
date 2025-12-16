import { memo } from "react";

import { Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import S from "./DependencyListSidebar.module.css";
import { ErrorSection } from "./ErrorSection";
import { LocationSection } from "./LocationSection";
import { PanelHeader } from "./PanelHeader";
import { getDependencyErrorGroups } from "./utils";

type DependencyListSidebarProps = {
  node: DependencyNode;
  onClose: () => void;
};

export const DependencyListSidebar = memo(function DependencyListSidebar({
  node,
  onClose,
}: DependencyListSidebarProps) {
  const errorGroups = getDependencyErrorGroups(node.errors ?? []);

  return (
    <Stack
      className={S.panel}
      p="lg"
      w="25rem"
      gap="lg"
      data-testid="dependency-list-sidebar"
    >
      <PanelHeader node={node} onClose={onClose} />
      <LocationSection node={node} />
      {errorGroups.map((errorGroup) => (
        <ErrorSection
          key={errorGroup.type}
          type={errorGroup.type}
          errors={errorGroup.errors}
        />
      ))}
    </Stack>
  );
});
