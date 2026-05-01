import { Panel } from "@xyflow/react";
import { useCallback, useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import { FixedSizeIcon, Group, Text, UnstyledButton } from "metabase/ui";
import { GraphInfoPanel } from "metabase-enterprise/dependencies/components/DependencyGraph/GraphInfoPanel";
import type {
  Database,
  DependencyId,
  Field,
  TableDependencyNode,
  TableDependencyNodeData,
} from "metabase-types/api";

import S from "../SchemaViewer.module.css";
import { useSchemaViewerContext } from "../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../types";

type SelectedNodeInfoPanelProps = {
  nodes: SchemaViewerFlowNode[];
  selectedNodeId: string | null;
  onClose: () => void;
};

/**
 * Wraps the shared GraphInfoPanel so it can live inside ReactFlow (where
 * useZoomToNodes is available) and adapt our ErdNode data into the
 * DependencyNode shape that GraphInfoPanel expects. Also handles:
 *  - onTitleClick: re-zoom onto the selected node
 *  - renderFieldExtras: append a clickable target-table name next to FK
 *    fields; clicking it pans to the linked table without dropping the
 *    current selection
 */
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

  const nodesByTableId = useMemo(() => {
    const map = new Map<number, SchemaViewerFlowNode>();
    for (const node of nodes) {
      map.set(Number(node.data.table_id), node);
    }
    return map;
  }, [nodes]);

  const dependencyNode = useMemo(() => {
    if (selectedNode == null) {
      return null;
    }
    const db = databasesResponse?.data?.find(
      (database) => database.id === selectedNode.data.db_id,
    );
    return toTableDependencyNode(selectedNode, db);
  }, [selectedNode, databasesResponse]);

  const handleTitleClick = useCallback(() => {
    if (selectedNode != null) {
      zoomToNode(selectedNode.id);
    }
  }, [selectedNode, zoomToNode]);

  const renderFieldExtras = useCallback(
    (field: Field) => {
      if (selectedNode == null) {
        return null;
      }
      const erdField = selectedNode.data.fields.find((f) => f.id === field.id);
      if (erdField?.fk_target_table_id == null) {
        return null;
      }
      const targetNode = nodesByTableId.get(
        Number(erdField.fk_target_table_id),
      );
      if (targetNode == null) {
        return null;
      }
      const targetName = targetNode.data.name;
      return (
        <Group gap="xs" wrap="nowrap">
          <Text c="text-tertiary">→</Text>
          <UnstyledButton
            className={S.fkLink}
            c="brand"
            onClick={() => zoomToNode(targetNode.id)}
          >
            <Group gap={4} wrap="nowrap" display="inline-flex">
              <FixedSizeIcon name="table2" />
              <span>{targetName}</span>
            </Group>
          </UnstyledButton>
        </Group>
      );
    },
    [selectedNode, nodesByTableId, zoomToNode],
  );

  if (dependencyNode == null) {
    return null;
  }

  return (
    <Panel className={S.infoPanel} position="top-right">
      <GraphInfoPanel
        node={dependencyNode}
        getGraphUrl={emptyGraphUrl}
        onClose={onClose}
        hideReplaceButton
        onTitleClick={handleTitleClick}
        renderFieldExtras={renderFieldExtras}
      />
    </Panel>
  );
}

function emptyGraphUrl(): string {
  return "";
}

/**
 * Adapt a SchemaViewer ErdNode into the TableDependencyNode shape consumed
 * by GraphInfoPanel. When a matching Database is passed, populate `data.db`
 * so PanelHeader renders the database + schema breadcrumbs. `transform` and
 * `owner` stay unset — the panel's optional sections degrade gracefully,
 * and the ERD payload doesn't carry that data.
 */
function toTableDependencyNode(
  node: SchemaViewerFlowNode,
  db?: Database,
): TableDependencyNode {
  const data: TableDependencyNodeData = {
    name: node.data.name,
    display_name: node.data.display_name,
    description: null,
    db_id: node.data.db_id,
    schema: node.data.schema ?? "",
    db,
    fields: node.data.fields.map(
      (f) =>
        ({
          id: f.id,
          name: f.name,
          display_name: f.display_name,
          database_type: f.database_type,
          semantic_type: f.semantic_type ?? null,
          fk_target_field_id: f.fk_target_field_id ?? null,
        }) as Field,
    ),
  };
  return {
    id: Number(node.data.table_id) as DependencyId,
    type: "table",
    data,
  };
}
