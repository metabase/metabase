import { Panel } from "@xyflow/react";
import { useCallback, useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import { GraphInfoPanel } from "metabase-enterprise/shared/components/GraphInfoPanel";
import type {
  ConcreteTableId,
  Database,
  ErdField,
  Field,
  TableDependencyNode,
  TableDependencyNodeData,
} from "metabase-types/api";

import { useSchemaViewerContext } from "../../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../../types";
import { getEdgeId } from "../../utils";

import { InfoPanelField } from "./InfoPanelField";
import S from "./SelectedNodeInfoPanel.module.css";

type SelectedNodeInfoPanelProps = {
  nodes: SchemaViewerFlowNode[];
  selectedNodeId: string | null;
  onClose: () => void;
};

/**
 * Wraps the shared GraphInfoPanel so it can live inside ReactFlow and adapt
 * our ErdNode data into the DependencyNode shape that GraphInfoPanel expects.
 * Also handles:
 *  - onTitleClick: re-zoom onto the selected node
 *  - renderField: render each field with the standard column icon + name and
 *    append a clickable target-table link for FK fields; clicking pans the
 *    camera to the linked table without dropping the current selection
 */
export function SelectedNodeInfoPanel({
  nodes,
  selectedNodeId,
  onClose,
}: SelectedNodeInfoPanelProps) {
  const { zoomToNode, expandToTable, expandingTableIds } =
    useSchemaViewerContext();

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
    const map = new Map<ConcreteTableId, SchemaViewerFlowNode>();
    for (const node of nodes) {
      map.set(node.data.table_id, node);
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

  const renderField = useCallback(
    (field: Field) => {
      const erdField =
        selectedNode != null ? lookupErdField(selectedNode, field.id) : null;
      const targetNode =
        erdField?.fk_target_table_id != null
          ? (nodesByTableId.get(erdField.fk_target_table_id) ?? null)
          : null;

      const isExternalFk =
        erdField?.fk_target_table_id != null && targetNode == null;
      const isExpanding =
        isExternalFk &&
        erdField?.fk_target_table_id != null &&
        expandingTableIds.has(erdField.fk_target_table_id);

      const handleFetchExternal = () => {
        if (erdField?.fk_target_table_id == null) {
          return;
        }
        const candidateEdgeIds =
          erdField.fk_target_field_id != null
            ? [
                getEdgeId(erdField.id, erdField.fk_target_field_id),
                getEdgeId(erdField.fk_target_field_id, erdField.id),
              ]
            : undefined;
        expandToTable(erdField.fk_target_table_id, candidateEdgeIds);
      };

      return (
        <InfoPanelField
          field={field}
          erdField={erdField}
          targetNode={targetNode}
          isExpanding={isExpanding}
          selectedNode={selectedNode}
          onFetchExternal={handleFetchExternal}
          onZoomToNode={zoomToNode}
        />
      );
    },
    [
      selectedNode,
      nodesByTableId,
      zoomToNode,
      expandToTable,
      expandingTableIds,
    ],
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
        withSourceReplacement={false}
        onTitleClick={handleTitleClick}
        renderField={renderField}
      />
    </Panel>
  );
}

function lookupErdField(
  selectedNode: SchemaViewerFlowNode,
  fieldId: Field["id"],
): ErdField | null {
  // Narrow to the numeric id form; ErdField only carries number ids, so a
  // LocalFieldReference (array form) can never match.
  if (typeof fieldId !== "number") {
    return null;
  }
  return selectedNode.data.fields.find((f) => f.id === fieldId) ?? null;
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
    // The cast to Field here is necessary, because GraphInfoPanel component
    // is too coupled with TableDependencyNode type, and to avoid duplicating
    // most of its internal code to create the same popup, it's easier
    // to cast it to expected type here.
    fields: node.data.fields.map(
      (f): Field =>
        ({
          id: f.id,
          name: f.name,
          display_name: f.display_name,
          database_type: f.database_type,
          base_type: f.base_type ?? undefined,
          effective_type: f.effective_type ?? undefined,
          semantic_type: f.semantic_type ?? null,
          fk_target_field_id: f.fk_target_field_id ?? null,
        }) as Field,
    ),
  };
  return {
    id: node.data.table_id,
    type: "table",
    data,
  };
}
