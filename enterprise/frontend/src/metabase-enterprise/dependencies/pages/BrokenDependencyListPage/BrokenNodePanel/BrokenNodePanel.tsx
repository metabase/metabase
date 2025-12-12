import { Title } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLabel } from "../../../utils";

type BrokenNodePanelProps = {
  node: DependencyNode;
};

export function BrokenNodePanel({ node }: BrokenNodePanelProps) {
  const label = getNodeLabel(node);
  return (
    <div>
      <Title order={4}>{label}</Title>
    </div>
  );
}
