import { Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import S from "./BrokenNodePanel.module.css";
import { ErrorSection } from "./ErrorSection";
import { PanelHeader } from "./PanelHeader";
import { getDependencyErrorGroups } from "./utils";

type BrokenNodePanelProps = {
  node: DependencyNode;
  onClose: () => void;
};

export function BrokenNodePanel({ node, onClose }: BrokenNodePanelProps) {
  const errorGroups = getDependencyErrorGroups(node.errors ?? []);

  return (
    <Stack className={S.panel} p="lg" w="25rem" gap="lg">
      <PanelHeader node={node} onClose={onClose} />
      {errorGroups.map((errorGroup) => (
        <ErrorSection
          key={errorGroup.type}
          type={errorGroup.type}
          errors={errorGroup.errors}
        />
      ))}
    </Stack>
  );
}
