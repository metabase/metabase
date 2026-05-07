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
  /** Defaults to `true`. See PanelHeader for details. */
  withSourceReplacement?: boolean;
  onTitleClick?: () => void;
  /** Defaults to the standard icon + display-name row. See PanelBody. */
  renderField?: (field: Field) => ReactNode;
};

export function GraphInfoPanel({
  node,
  getGraphUrl,
  onClose,
  withSourceReplacement,
  onTitleClick,
  renderField,
}: GraphInfoPanelProps) {
  return (
    <Card className={S.root} withBorder data-testid="graph-info-panel">
      <PanelHeader
        node={node}
        onClose={onClose}
        withSourceReplacement={withSourceReplacement}
        onTitleClick={onTitleClick}
      />
      <PanelBody
        node={node}
        getGraphUrl={getGraphUrl}
        renderField={renderField}
      />
    </Card>
  );
}
