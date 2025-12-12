import { memo } from "react";

import { Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import S from "./DependencyPanel.module.css";
import { ErrorSection } from "./ErrorSection";
import { LocationSection } from "./LocationSection";
import { PanelHeader } from "./PanelHeader";
import { getDependencyErrorGroups } from "./utils";

type DependencyListPanelProps = {
  node: DependencyNode;
  onClose: () => void;
};

export const DependencyListPanel = memo(function DependencyListPanel({
  node,
  onClose,
}: DependencyListPanelProps) {
  const errorGroups = getDependencyErrorGroups(node.errors ?? []);

  return (
    <Stack className={S.panel} p="lg" w="25rem" gap="lg">
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
