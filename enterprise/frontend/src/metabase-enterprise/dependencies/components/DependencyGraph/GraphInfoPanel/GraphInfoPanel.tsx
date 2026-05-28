import { Card } from "metabase/ui";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import S from "./GraphInfoPanel.module.css";
import { PanelBody } from "./PanelBody";
import { PanelHeader } from "./PanelHeader";

type GraphInfoPanelProps = {
  node: DependencyNode;
  getGraphUrl: (entry: DependencyEntry) => string;
  onClose: () => void;
};

export function GraphInfoPanel({
  node,
  getGraphUrl,
  onClose,
}: GraphInfoPanelProps) {
  return (
    <Card className={S.root} withBorder data-testid="graph-info-panel">
      <PanelHeader node={node} onClose={onClose} />
      <PanelBody node={node} getGraphUrl={getGraphUrl} />
    </Card>
  );
}
