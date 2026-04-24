import type { ReactNode } from "react";

import { Card } from "metabase/ui";
import type {
  DependencyEntry,
  DependencyNode,
  Field,
} from "metabase-types/api";

import S from "./GraphInfoPanel.module.css";
import { PanelBody } from "./PanelBody";
import { PanelHeader } from "./PanelHeader";

type GraphInfoPanelProps = {
  node: DependencyNode;
  getGraphUrl: (entry: DependencyEntry) => string;
  onClose: () => void;
  hideReplaceButton?: boolean;
  onTitleClick?: () => void;
  renderFieldExtras?: (field: Field) => ReactNode;
};

export function GraphInfoPanel({
  node,
  getGraphUrl,
  onClose,
  hideReplaceButton,
  onTitleClick,
  renderFieldExtras,
}: GraphInfoPanelProps) {
  return (
    <Card className={S.root} withBorder data-testid="graph-info-panel">
      <PanelHeader
        node={node}
        onClose={onClose}
        hideReplaceButton={hideReplaceButton}
        onTitleClick={onTitleClick}
      />
      <PanelBody
        node={node}
        getGraphUrl={getGraphUrl}
        renderFieldExtras={renderFieldExtras}
      />
    </Card>
  );
}
