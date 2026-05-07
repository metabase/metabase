import { Panel } from "@xyflow/react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { getColumnIcon } from "metabase/common/utils/columns";
import {
  Box,
  FixedSizeIcon,
  Group,
  Loader,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { GraphInfoPanel } from "metabase-enterprise/shared/components/GraphInfoPanel";
import * as Lib from "metabase-lib";
import type {
  ConcreteTableId,
  Database,
  DependencyId,
  ErdField,
  Field,
  TableDependencyNode,
  TableDependencyNodeData,
} from "metabase-types/api";

import S from "../SchemaViewer.module.css";
import { useSchemaViewerContext } from "../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../types";
import { getEdgeId } from "../utils";

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
  const { zoomToNode, onExpandToTable, expandingTableIds } =
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

  const renderField = useCallback(
    (field: Field) => {
      const fieldIcon = getColumnIcon(Lib.legacyColumnTypeInfo(field));
      const erdField =
        selectedNode != null ? lookupErdField(selectedNode, field.id) : null;
      const targetNode =
        erdField?.fk_target_table_id != null
          ? (nodesByTableId.get(Number(erdField.fk_target_table_id)) ?? null)
          : null;

      // Off-canvas FK target: clicking the field name fires the same FK
      // expansion that a click on the matching field row in the table card
      // does, then highlights the new connecting edge once the response
      // merges.
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
        onExpandToTable(
          erdField.fk_target_table_id as ConcreteTableId,
          candidateEdgeIds,
        );
      };

      const isExternalFk =
        erdField?.fk_target_table_id != null && targetNode == null;
      const isFetchingExternal =
        isExternalFk &&
        erdField?.fk_target_table_id != null &&
        expandingTableIds.has(erdField.fk_target_table_id as ConcreteTableId);

      const fieldName = <Box className={S.fieldName}>{field.display_name}</Box>;

      return (
        <Group className={S.fieldRow} gap="sm" wrap="nowrap">
          <FixedSizeIcon name={fieldIcon} c="text-secondary" />
          {isExternalFk ? (
            <Tooltip
              label={t`Fetch external table`}
              disabled={isFetchingExternal}
            >
              <UnstyledButton
                className={S.fkLink}
                c="brand"
                disabled={isFetchingExternal}
                onClick={handleFetchExternal}
              >
                {fieldName}
              </UnstyledButton>
            </Tooltip>
          ) : (
            fieldName
          )}
          {isFetchingExternal && (
            <Loader
              size="xs"
              data-testid="schema-viewer-info-panel-fetch-loader"
            />
          )}
          {targetNode != null && (
            <Group gap="xs" wrap="nowrap" flex="1 1 auto" miw={0}>
              <Text c="text-tertiary" lh={1}>
                →
              </Text>
              <UnstyledButton
                className={S.fkLink}
                c="brand"
                onClick={() => zoomToNode(targetNode.id)}
              >
                <Group
                  gap={4}
                  wrap="nowrap"
                  display="inline-flex"
                  style={{ alignItems: "center" }}
                  w="100%"
                >
                  <FixedSizeIcon name="table2" />
                  <span className={S.targetName}>
                    {formatTargetTableName(selectedNode, targetNode)}
                  </span>
                </Group>
              </UnstyledButton>
            </Group>
          )}
        </Group>
      );
    },
    [
      selectedNode,
      nodesByTableId,
      zoomToNode,
      onExpandToTable,
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
 * Render the FK target table's display name. If the target sits in a
 * different schema than the selected (source) table — i.e. it was expanded
 * into via cross-schema FK — prefix the name with `schema.` so the user can
 * see at a glance that it's external.
 */
function formatTargetTableName(
  selectedNode: SchemaViewerFlowNode | null,
  targetNode: SchemaViewerFlowNode,
): string {
  const targetName = targetNode.data.name;
  const targetSchema = targetNode.data.schema;
  const sourceSchema = selectedNode?.data.schema ?? null;
  const isExternalSchema =
    targetSchema != null &&
    targetSchema !== "" &&
    targetSchema !== sourceSchema;
  return isExternalSchema ? `${targetSchema}.${targetName}` : targetName;
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
          base_type: f.base_type ?? undefined,
          effective_type: f.effective_type ?? undefined,
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
