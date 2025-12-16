import { memo } from "react";

import { Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { CreatorAndLastEditorSection } from "./CreatorAndLastEditorSection";
import { ErrorSection } from "./ErrorSection";
import S from "./ListSidebar.module.css";
import { LocationSection } from "./LocationSection";
import { PanelHeader } from "./PanelHeader";
import { getDependencyErrorGroups } from "./utils";

type ListSidebarProps = {
  node: DependencyNode;
  onClose: () => void;
};

export const ListSidebar = memo(function ListSidebar({
  node,
  onClose,
}: ListSidebarProps) {
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
      <CreatorAndLastEditorSection node={node} />
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
