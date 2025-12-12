import { Title } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLabel } from "../../../utils";

type UnreferencedNodePanelProps = {
  node: DependencyNode;
};

export function UnreferencedNodePanel({ node }: UnreferencedNodePanelProps) {
  const label = getNodeLabel(node);
  return (
    <div>
      <Title order={4}>{label}</Title>
    </div>
  );
}
