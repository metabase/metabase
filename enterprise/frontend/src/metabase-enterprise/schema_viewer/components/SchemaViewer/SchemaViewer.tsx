import {
  Background,
  Panel,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  SchemaName,
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
import { useEdgeHandlers } from "./hooks/useEdgeHandlers";
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
  contextKey: `${DatabaseId}__${SchemaName}` | null;
  focalTableId: ConcreteTableId | null;
  onExtraTableIdAdd: (tableId: ConcreteTableId) => void;
};

export function SchemaViewer({
  databaseId,
  schema,
  focalTableId,
  onExtraTableIdAdd,
  contextKey,
  data,
  isFetching,
  error,
}: SchemaViewerProps) {
  const { colorScheme } = useColorScheme();

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

  // Target table IDs whose FK-expansion fetch is still in flight.
  const [expandingTableIds, setExpandingTableIds] = useState<
    Set<ConcreteTableId>
  >(() => new Set());

  // Without this, dragging a node (which produces a new `nodes` array on
  // every animation frame) would force every TableNode + FieldRow to
  // re-render through `useContext`.
  const visibleTableIdsRef = useRef<Set<ConcreteTableId>>(new Set());
  const visibleTableIds = useMemo(() => {
    const prev = visibleTableIdsRef.current;
    if (prev.size === nodes.length) {
      const hasAllNodes = nodes.every((n) => prev.has(n.data.table_id));
      if (hasAllNodes) {
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

  const [selectedNodeIdIntent, setSelectedNodeId] = useState<string | null>(
    null,
  );
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

  // When the URL pins exactly one table-id from current schema, which happens
  // when user opens Schema Viewer from a table metadata sidebar in Table Details,
  // zoom onto that table once ReactFlow has actually drawn it.
  const focalZoomRef = useRef<{
    contextKey: string;
    focalTableId: ConcreteTableId;
  } | null>(null);

  useEffect(() => {
    if (
      focalTableId == null ||
      schema == null ||
      contextKey == null ||
      nodes.length === 0
    ) {
      return;
    }
    const targetNode = nodes.find((n) => n.data.table_id === focalTableId);
    if (
      targetNode == null ||
      targetNode.data.schema !== schema ||
      targetNode.measured?.width == null
    ) {
      return;
    }
    const done = focalZoomRef.current;
    if (done?.contextKey === contextKey && done.focalTableId === focalTableId) {
      return;
    }
    zoomToNode(targetNode.id);
    focalZoomRef.current = { contextKey, focalTableId };
  }, [focalTableId, schema, contextKey, nodes, zoomToNode]);

  const { resetLayout, focusOnNode } = useCanvasLayout({
    nodes,
    edges,
    setNodes,
    setEdges,
    zoomToNode,
    zoomToCanvas,
  });

  const { handleEdgeClick, clearEdgeSelection } = useEdgeHandlers({
    zoomToNode,
    setNodes,
    setEdges,
  });

  // FK click registers a pending expansion target so graph sync can auto-select the FK
  // edge AND zoom to the new table once the next ERD response merges.
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

  const handleClearSelection = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId);
      if (nodeId != null) {
        clearEdgeSelection();
      }
    },
    [clearEdgeSelection],
  );

  const handleSchemaChange = useCallback(() => {
    setSelectedNodeId(null);
    cancelZoom();
  }, [cancelZoom]);

  const schemaViewerContextValue = useMemo(
    () => ({
      visibleTableIds,
      expandingTableIds,
      expandToTable: handleExpandToTable,
      selectedNodeId,
      selectNode: handleSelectNode,
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
        onPaneClick={clearEdgeSelection}
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
                bg="background_page-primary"
                variant="default"
                leftSection={<Icon name="sparkles" />}
                onClick={resetLayout}
              >
                {t`Auto-layout`}
              </Button>
              {selectedNodeId != null && (
                <Button
                  bg="background_page-primary"
                  variant="default"
                  onClick={() => focusOnNode(selectedNodeId)}
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
          <Panel position="bottom-center">
            <Stack
              align="center"
              justify="center"
              pt="xl"
              data-testid="schema-viewer-empty-state"
            >
              <Text c="text-disabled">{t`No schema selected`}</Text>
            </Stack>
          </Panel>
        )}
      </ReactFlow>
    </SchemaViewerContext.Provider>
  );
}
