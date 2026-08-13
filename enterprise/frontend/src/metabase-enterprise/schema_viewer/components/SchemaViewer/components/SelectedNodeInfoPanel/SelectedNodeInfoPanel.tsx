import { Panel } from "@xyflow/react";
import { useCallback, useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import { Card } from "metabase/ui";

import { useSchemaViewerContext } from "../../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../../types";

import { PanelBody } from "./PanelBody";
import { PanelHeader } from "./PanelHeader";
import S from "./SelectedNodeInfoPanel.module.css";

type SelectedNodeInfoPanelProps = {
  nodes: SchemaViewerFlowNode[];
  selectedNodeId: string | null;
  onClose: () => void;
};

export function SelectedNodeInfoPanel({
  nodes,
  selectedNodeId,
  onClose,
}: SelectedNodeInfoPanelProps) {
  const { zoomToNode } = useSchemaViewerContext();

  const { data: databasesResponse } = useListDatabasesQuery({
    include: "schemas",
  });

  const selectedNode = useMemo(
    () =>
      selectedNodeId != null
        ? (nodes.find((n) => n.id === selectedNodeId) ?? null)
        : null,
    [nodes, selectedNodeId],
  );

  const database = useMemo(
    () =>
      selectedNode != null
        ? databasesResponse?.data?.find(
            (db) => db.id === selectedNode.data.db_id,
          )
        : undefined,
    [selectedNode, databasesResponse],
  );

  const handleTitleClick = useCallback(() => {
    if (selectedNode != null) {
      zoomToNode(selectedNode.id);
    }
  }, [selectedNode, zoomToNode]);

  if (selectedNode == null) {
    return null;
  }

  return (
    <Panel className={S.infoPanel} position="top-right">
      <Card className={S.card} withBorder data-testid="graph-info-panel">
        <PanelHeader
          node={selectedNode}
          database={database}
          onClose={onClose}
          onTitleClick={handleTitleClick}
        />
        <PanelBody node={selectedNode} nodes={nodes} />
      </Card>
    </Panel>
  );
}
