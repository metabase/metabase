import {
  Background,
  Panel,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils/errors";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import {
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  useColorScheme,
} from "metabase/ui";
import type {
  ConcreteTableId,
  DatabaseId,
  ErdResponse,
} from "metabase-types/api";

import S from "./SchemaViewer.module.css";
import { SchemaViewerContext } from "./SchemaViewerContext";
import { SchemaViewerEdge } from "./components/Edge";
import { SchemaViewerNodeSearch } from "./components/NodeSearch";
import { SchemaPickerInput } from "./components/SchemaPickerInput";
import { SchemaViewerMinimap } from "./components/SchemaViewerMinimap";
import { SelectedNodeInfoPanel } from "./components/SelectedNodeInfoPanel";
import { SchemaViewerTableNode } from "./components/TableNode";
import { FIT_VIEW_OPTIONS, MAX_ZOOM, MIN_ZOOM } from "./constants";
import { useCanvasLayout } from "./hooks/useCanvasLayout";
import { useEdgeZoom } from "./hooks/useEdgeZoom";
import { useGraphSync } from "./hooks/useGraphSync";
import { useSchemaViewerZoomMethods } from "./hooks/useSchemaViewerZoomMethods";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "./types";
import { toFlowGraph } from "./utils";

const NODE_TYPES = {
  schemaViewerTable: SchemaViewerTableNode,
};

const EDGE_TYPES = {
  schemaViewerEdge: SchemaViewerEdge,
};

const PRO_OPTIONS = {
  hideAttribution: true,
};

type SchemaViewerProps = {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  data: ErdResponse | undefined;
  isFetching: boolean;
  error: unknown;
  /** db__schema key for canvas cleanup */
  contextKey: string | null;
  /** Add a table to current selected schema (FK click expansion). */
  onExtraTableIdAdd: (tableId: ConcreteTableId) => void;
};

export function SchemaViewer({
  databaseId,
  schema,
  onExtraTableIdAdd,
  contextKey,
  data,
  isFetching,
  error,
}: SchemaViewerProps) {
  const { colorScheme } = useColorScheme();

  // ReactFlow node/edge state + instance
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<
    SchemaViewerFlowNode,
    SchemaViewerFlowEdge
  > | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaViewerFlowNode>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<SchemaViewerFlowEdge>(
    [],
  );

  const { zoomToNode, zoomToCanvas, cancelZoom } =
    useSchemaViewerZoomMethods(reactFlowInstance);

  // Target table IDs whose FK-expansion fetch is still in flight. Field rows
  // use this to swap the database-type text for a loader until the new table
  // arrives in the graph (or the fetch errors out / the context changes).
  const [expandingTableIds, setExpandingTableIds] = useState<
    Set<ConcreteTableId>
  >(() => new Set());

  // Selection intent: the user picks a table and we remember that pick. The
  // visible `selectedNodeId` is derived below — when the picked node
  // temporarily disappears (schema change, table removed) the info panel
  // renders nothing without us having to clear the intent in an effect.
  const [selectedNodeIdIntent, setSelectedNodeId] = useState<string | null>(
    null,
  );

  // Track the node id most recently focused via the Focus node button so the
  // button can disable itself until the user selects a different node.
  const [lastFocusedNodeId, setLastFocusedNodeId] = useState<string | null>(
    null,
  );

  // Stable Set: returns the same reference until the *membership* changes.
  // Without this, dragging a node (which produces a new `nodes` array on
  // every animation frame) would build a new Set each tick, rebuild the
  // SchemaViewerContext value, and force every TableNode + FieldRow to
  // re-render through `useContext` — which `memo` does NOT shield against.
  const visibleTableIdsRef = useRef<Set<ConcreteTableId>>(new Set());
  const visibleTableIds = useMemo(() => {
    const prev = visibleTableIdsRef.current;
    if (prev.size === nodes.length) {
      let same = true;
      for (const n of nodes) {
        if (!prev.has(n.data.table_id)) {
          same = false;
          break;
        }
      }
      if (same) {
        return prev;
      }
    }
    const next = new Set<ConcreteTableId>();
    for (const n of nodes) {
      next.add(n.data.table_id);
    }
    visibleTableIdsRef.current = next;
    return next;
  }, [nodes]);

  const selectedNodeId = useMemo(
    () =>
      selectedNodeIdIntent != null &&
      nodes.some((n) => n.id === selectedNodeIdIntent)
        ? selectedNodeIdIntent
        : null,
    [nodes, selectedNodeIdIntent],
  );

  const graph = useMemo(() => {
    if (data == null) {
      return null;
    }
    return toFlowGraph(data);
  }, [data]);

  const hasDbSelected = databaseId != null;
  const { registerPendingExpansion } = useGraphSync({
    hasDbSelected,
    error,
    isFetching,
    graph,
    nodes,
    contextKey,
    setNodes,
    setEdges,
    setExpandingTableIds,
    zoomToNode,
    zoomToCanvas,
  });

  const { resetLayout, focusOnNode } = useCanvasLayout({
    nodes,
    edges,
    setNodes,
    setEdges,
    zoomToNode,
    zoomToCanvas,
  });

  const { handleEdgeClick } = useEdgeZoom({
    zoomToNode,
  });

  // FK click: persist the new focal table, mark its fetch as in-flight, and
  // register a pending expansion target so graph sync can auto-select the FK
  // edge AND zoom to the new table once the next ERD response merges. If
  // multiple FK clicks land before the response, the last registration wins
  // (zoom follows the most recent click).
  const handleExpandToTable = useCallback(
    (
      tableId: ConcreteTableId,
      candidateEdgeIdsToSelect?: readonly string[],
    ) => {
      if (databaseId == null) {
        return;
      }
      onExtraTableIdAdd(tableId);
      setExpandingTableIds((prev) => {
        if (prev.has(tableId)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(tableId);
        return next;
      });
      registerPendingExpansion(tableId, candidateEdgeIdsToSelect);
    },
    [
      databaseId,
      onExtraTableIdAdd,
      setExpandingTableIds,
      registerPendingExpansion,
    ],
  );

  // Focus button: apply focal layout + remember last-focused so the button
  // can disable itself until the user picks a different node.
  const handleFocusNode = useCallback(
    (nodeId: string) => {
      focusOnNode(nodeId);
      setLastFocusedNodeId(nodeId);
    },
    [focusOnNode],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId);
      if (nodeId != null) {
        setEdges((currentEdges) =>
          currentEdges.map((e) => (e.selected ? { ...e, selected: false } : e)),
        );
      }
    },
    [setEdges],
  );

  const handleSchemaChange = useCallback(() => {
    setSelectedNodeId(null);
    cancelZoom();
  }, [cancelZoom]);

  const schemaViewerContextValue = useMemo(
    () => ({
      visibleTableIds,
      expandingTableIds,
      onExpandToTable: handleExpandToTable,
      selectedNodeId,
      onSelectNode: handleSelectNode,
      zoomToNode,
    }),
    [
      visibleTableIds,
      expandingTableIds,
      handleExpandToTable,
      selectedNodeId,
      handleSelectNode,
      zoomToNode,
    ],
  );

  return (
    <SchemaViewerContext.Provider value={schemaViewerContextValue}>
      <ReactFlow
        className={S.reactFlow}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        proOptions={PRO_OPTIONS}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        colorMode={colorScheme === "dark" ? "dark" : "light"}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        onInit={setReactFlowInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
      >
        <Background />
        <SchemaViewerMinimap />

        <Panel className={S.entryInput} position="top-left">
          <Group gap="sm">
            <SchemaPickerInput
              databaseId={databaseId}
              schema={schema}
              onSchemaChange={handleSchemaChange}
            />
            <SchemaViewerNodeSearch key={contextKey ?? ""} nodes={nodes} />
          </Group>
        </Panel>

        <Panel position="top-right">
          <AppSwitcher className={S.appSwitcher} />
        </Panel>

        {nodes.length > 0 && (
          <Panel position="bottom-left">
            <Group gap="sm">
              <Button
                bg="background-primary"
                variant="default"
                leftSection={<Icon name="sparkles" />}
                onClick={resetLayout}
              >
                {t`Auto-layout`}
              </Button>
              {selectedNodeId != null && (
                <Button
                  bg="background-primary"
                  variant="default"
                  disabled={selectedNodeId === lastFocusedNodeId}
                  onClick={() => handleFocusNode(selectedNodeId)}
                >
                  {t`Focus node`}
                </Button>
              )}
            </Group>
          </Panel>
        )}

        <SelectedNodeInfoPanel
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          onClose={handleClearSelection}
        />

        {isFetching && expandingTableIds.size === 0 && (
          <Box className={S.centerLoader} data-testid="schema-viewer-loader">
            <Loader />
          </Box>
        )}
        {error != null && (
          <Panel position="bottom-center">
            <Stack
              align="center"
              justify="center"
              mb="xl"
              data-testid="schema-viewer-error"
            >
              <Text c="text-secondary">
                {getErrorMessage(error, t`Failed to load schema.`)}
              </Text>
            </Stack>
          </Panel>
        )}
        {!hasDbSelected && !isFetching && error == null && (
          <Panel position="top-center">
            <Stack
              align="center"
              justify="center"
              pt="xl"
              data-testid="schema-viewer-empty-state"
            >
              <Text c="text-tertiary">{t`Pick a database to view its schema`}</Text>
            </Stack>
          </Panel>
        )}
      </ReactFlow>
    </SchemaViewerContext.Provider>
  );
}
