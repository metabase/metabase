// Deliberate import-time side effect: xyflow's stylesheet must load with this
// chunk. If this module is ever declared side-effect free, the bundler would
// drop this import and the graph would render unstyled.
import "@xyflow/react/dist/style.css";
import {
  Background,
  type OnMoveEnd,
  Panel,
  ReactFlow,
  type ReactFlowInstance,
  type Viewport,
  ViewportPortal,
  type XYPosition,
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
import { SchemaViewerEdgeLayer } from "./components/EdgeLayer";
import { SchemaViewerNodeSearch } from "./components/NodeSearch";
import { SchemaPickerInput } from "./components/SchemaPickerInput";
import { SchemaViewerMinimap } from "./components/SchemaViewerMinimap";
import { SelectedNodeInfoPanel } from "./components/SelectedNodeInfoPanel";
import { SchemaViewerTableNode } from "./components/TableNode";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import { useCanvasLayout } from "./hooks/useCanvasLayout";
import { useEdgeHandlers } from "./hooks/useEdgeHandlers";
import { useGraphLayout } from "./hooks/useGraphLayout";
import { useGraphSync } from "./hooks/useGraphSync";
import { useRenderedGraph } from "./hooks/useRenderedGraph";
import { useSchemaViewerDetails } from "./hooks/useSchemaViewerDetails";
import { useSchemaViewerZoomMethods } from "./hooks/useSchemaViewerZoomMethods";
import { useSettledNodes } from "./hooks/useSettledNodes";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "./types";
import { toFlowGraph } from "./utils";
import {
  type EdgeGeometry,
  findEdgeAtPoint,
  getEdgeGeometry,
} from "./utils/edge-geometry";

const NODE_TYPES = {
  schemaViewerTable: SchemaViewerTableNode,
};

// Click tolerance around edges, in screen pixels.
const EDGE_HIT_TOLERANCE_PX = 10;

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
  const [isNodeDragging, setIsNodeDragging] = useState(false);
  // Metadata consumers read this so per-frame drag updates don't recompute them.
  const settledNodes = useSettledNodes(nodes, isNodeDragging);
  const [edges, setEdges] = useState<SchemaViewerFlowEdge[]>([]);
  const graphLayout = useGraphLayout();
  const { cancelLayout, pendingReason, layoutError, clearLayoutError } =
    graphLayout;

  // Target table IDs whose FK-expansion fetch is still in flight.
  const [expandingTableIds, setExpandingTableIds] = useState<
    Set<ConcreteTableId>
  >(() => new Set());

  // Keep the same Set while membership is unchanged; a new one would re-render
  // every TableNode + FieldRow through `useContext`.
  const visibleTableIdsRef = useRef<Set<ConcreteTableId>>(new Set());
  const visibleTableIds = useMemo(() => {
    const prev = visibleTableIdsRef.current;
    if (prev.size === settledNodes.length) {
      const hasAllNodes = settledNodes.every((n) => prev.has(n.data.table_id));
      if (hasAllNodes) {
        return prev;
      }
    }
    const next = new Set<ConcreteTableId>();
    for (const n of settledNodes) {
      next.add(n.data.table_id);
    }
    visibleTableIdsRef.current = next;
    return next;
  }, [settledNodes]);

  const [selectedNodeIdIntent, setSelectedNodeId] = useState<string | null>(
    null,
  );
  const selectedNodeId = useMemo(
    () =>
      selectedNodeIdIntent != null &&
      settledNodes.some((n) => n.id === selectedNodeIdIntent)
        ? selectedNodeIdIntent
        : null,
    [settledNodes, selectedNodeIdIntent],
  );
  const forcedDetailedNodeIds = useMemo(
    () =>
      selectedNodeId == null
        ? new Set<string>()
        : new Set<string>([selectedNodeId]),
    [selectedNodeId],
  );
  const {
    detailsStore,
    settleViewport,
    recomputeDetails,
    focusNode: focusNodeDetails,
  } = useSchemaViewerDetails({
    nodes,
    forcedNodeIds: forcedDetailedNodeIds,
  });
  const {
    renderedNodes,
    renderedEdges,
    settleViewport: settleRenderedGraph,
    recomputeWindow,
    includeViewport,
  } = useRenderedGraph({
    nodes,
    edges,
    forcedNodeIds: forcedDetailedNodeIds,
  });

  const {
    zoomToNode: zoomToNodeInternal,
    zoomToCanvas,
    cancelZoom,
  } = useSchemaViewerZoomMethods(reactFlowInstance, nodes, includeViewport);

  const zoomToNode = useCallback(
    (nodeId: string) => {
      focusNodeDetails(nodeId);
      zoomToNodeInternal(nodeId);
    },
    [focusNodeDetails, zoomToNodeInternal],
  );
  const reactFlowContainerRef = useRef<HTMLDivElement>(null);
  const isNodeDraggingRef = useRef(false);

  const isMinimapPanningRef = useRef(false);

  const settleAt = useCallback(
    (viewport: Viewport) => {
      const container = reactFlowContainerRef.current;
      const size = {
        width: container?.clientWidth ?? 0,
        height: container?.clientHeight ?? 0,
      };
      settleViewport(viewport, size);
      settleRenderedGraph(viewport, size);
    },
    [settleViewport, settleRenderedGraph],
  );

  const handleMoveEnd = useCallback<OnMoveEnd>(
    (_event, viewport) => {
      // Minimap drags move the camera many times; settle once on release.
      if (!isMinimapPanningRef.current) {
        settleAt(viewport);
      }
    },
    [settleAt],
  );

  const handleMinimapPanStart = useCallback(() => {
    isMinimapPanningRef.current = true;
    cancelZoom();
  }, [cancelZoom]);

  const handleMinimapPanTo = useCallback(
    (point: XYPosition) => {
      reactFlowInstance?.setCenter(point.x, point.y, {
        zoom: reactFlowInstance.getZoom(),
      });
    },
    [reactFlowInstance],
  );

  const handleMinimapPanEnd = useCallback(() => {
    isMinimapPanningRef.current = false;
    if (reactFlowInstance != null) {
      settleAt(reactFlowInstance.getViewport());
    }
  }, [reactFlowInstance, settleAt]);

  const handleNodeDragStart = useCallback(() => {
    isNodeDraggingRef.current = true;
    setIsNodeDragging(true);
    cancelLayout();
  }, [cancelLayout]);

  const handleNodeDragStop = useCallback(() => {
    isNodeDraggingRef.current = false;
    setIsNodeDragging(false);
    recomputeDetails();
    recomputeWindow();
  }, [recomputeDetails, recomputeWindow]);

  useEffect(() => {
    if (!isNodeDraggingRef.current) {
      recomputeDetails();
      recomputeWindow();
    }
  }, [nodes, recomputeDetails, recomputeWindow]);

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
    graphLayout,
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
      settledNodes.length === 0
    ) {
      return;
    }
    const targetNode = settledNodes.find(
      (n) => n.data.table_id === focalTableId,
    );
    if (
      targetNode == null ||
      targetNode.data.schema !== schema ||
      targetNode.width == null
    ) {
      return;
    }
    const done = focalZoomRef.current;
    if (done?.contextKey === contextKey && done.focalTableId === focalTableId) {
      return;
    }
    zoomToNode(targetNode.id);
    focalZoomRef.current = { contextKey, focalTableId };
  }, [focalTableId, schema, contextKey, settledNodes, zoomToNode]);

  const { resetLayout, focusOnNode } = useCanvasLayout({
    nodes,
    edges,
    setNodes,
    setEdges,
    zoomToNode,
    zoomToCanvas,
    graphLayout,
  });

  const { clickEdge, clearEdgeSelection, selectEdges } = useEdgeHandlers({
    zoomToNode,
    setNodes,
    setEdges,
  });

  // Edges are drawn and hit-tested outside React Flow, from logical node
  // positions, so an edge to an unrendered table still appears.
  const edgeGeometries = useMemo(() => {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    return renderedEdges
      .map((edge) => getEdgeGeometry(edge, nodesById))
      .filter((geometry): geometry is EdgeGeometry => geometry != null);
  }, [nodes, renderedEdges]);
  const selectedEdgeIds = useMemo(
    () => new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id)),
    [edges],
  );

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (reactFlowInstance == null) {
        return;
      }
      const point = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const edgeId = findEdgeAtPoint(
        edgeGeometries,
        point,
        EDGE_HIT_TOLERANCE_PX / reactFlowInstance.getZoom(),
      );
      const edge = edges.find(({ id }) => id === edgeId);
      if (edge == null) {
        clearEdgeSelection();
      } else {
        clickEdge(edge);
      }
    },
    [reactFlowInstance, edgeGeometries, edges, clickEdge, clearEdgeSelection],
  );

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
      cancelLayout();
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
      cancelLayout,
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
    cancelLayout();
    clearLayoutError();
    setSelectedNodeId(null);
    cancelZoom();
  }, [cancelLayout, cancelZoom, clearLayoutError]);

  const schemaViewerContextValue = useMemo(
    () => ({
      visibleTableIds,
      detailsStore,
      expandingTableIds,
      expandToTable: handleExpandToTable,
      selectedNodeId,
      selectNode: handleSelectNode,
      zoomToNode,
      selectEdges,
    }),
    [
      visibleTableIds,
      detailsStore,
      expandingTableIds,
      handleExpandToTable,
      selectedNodeId,
      handleSelectNode,
      zoomToNode,
      selectEdges,
    ],
  );

  return (
    <SchemaViewerContext.Provider value={schemaViewerContextValue}>
      <ReactFlow
        ref={reactFlowContainerRef}
        className={S.reactFlow}
        nodes={renderedNodes}
        nodeTypes={NODE_TYPES}
        proOptions={PRO_OPTIONS}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        colorMode={colorScheme === "dark" ? "dark" : "light"}
        nodesConnectable={false}
        onInit={setReactFlowInstance}
        onMoveEnd={handleMoveEnd}
        onNodesChange={onNodesChange}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={clearEdgeSelection}
        onPaneClick={handlePaneClick}
      >
        <Background />
        <ViewportPortal>
          <SchemaViewerEdgeLayer
            geometries={edgeGeometries}
            selectedEdgeIds={selectedEdgeIds}
          />
        </ViewportPortal>
        <SchemaViewerMinimap
          nodes={settledNodes}
          edges={edges}
          onPanStart={handleMinimapPanStart}
          onPanTo={handleMinimapPanTo}
          onPanEnd={handleMinimapPanEnd}
        />

        <Panel className={S.entryInput} position="top-left">
          <Group gap="sm">
            <SchemaPickerInput
              databaseId={databaseId}
              schema={schema}
              onSchemaChange={handleSchemaChange}
            />
            <SchemaViewerNodeSearch
              key={contextKey ?? ""}
              nodes={settledNodes}
            />
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
                leftSection={<Icon name="sparkles" />}
                loading={pendingReason === "auto-layout"}
                onClick={resetLayout}
              >
                {t`Auto-layout`}
              </Button>
              {selectedNodeId != null && (
                <Button
                  bg="background_page-primary"
                  loading={pendingReason === "focus-node"}
                  onClick={() => focusOnNode(selectedNodeId)}
                >
                  {t`Focus node`}
                </Button>
              )}
            </Group>
          </Panel>
        )}

        <SelectedNodeInfoPanel
          nodes={settledNodes}
          selectedNodeId={selectedNodeId}
          onClose={handleClearSelection}
        />

        {(isFetching ||
          (pendingReason === "graph-sync" && nodes.length === 0)) &&
          expandingTableIds.size === 0 && (
            <Box className={S.centerLoader} data-testid="schema-viewer-loader">
              <Loader />
            </Box>
          )}
        {layoutError != null && error == null && (
          <Panel position="bottom-center">
            <Stack
              align="center"
              justify="center"
              mb="xxl"
              data-testid="schema-viewer-layout-error"
            >
              <Text c="text-secondary">
                {getErrorMessage(layoutError, t`Failed to lay out schema.`)}
              </Text>
            </Stack>
          </Panel>
        )}
        {error != null && (
          <Panel position="bottom-center">
            <Stack
              align="center"
              justify="center"
              mb="xxl"
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
              pt="xxl"
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
