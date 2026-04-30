import {
  Background,
  MiniMap,
  Panel,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils/errors";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import {
  Box,
  Button,
  Group,
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
import { AutoLayoutButton } from "./components/AutoLayoutButton";
import { SchemaViewerEdge } from "./components/Edge";
import { SchemaViewerNodeSearch } from "./components/NodeSearch";
import { SchemaPickerInput } from "./components/SchemaPickerInput";
import { SelectedNodeInfoPanel } from "./components/SelectedNodeInfoPanel";
import { SchemaViewerTableNode } from "./components/TableNode";
import { FIT_VIEW_OPTIONS, MAX_ZOOM, MIN_ZOOM } from "./constants";
import { useCanvasLayout } from "./hooks/useCanvasLayout";
import { useEdgeZoom } from "./hooks/useEdgeZoom";
import { useGraphSync } from "./hooks/useGraphSync";
import { zoomToNodes } from "./hooks/useZoomToNodes";
import type {
  PendingViewportFit,
  SchemaViewerFlowEdge,
  SchemaViewerFlowNode,
  ViewportFitAction,
} from "./types";
import { toFlowGraph } from "./utils";
import { markSelectedEdge } from "./utils/flow-graph";

const NODE_TYPES = {
  schemaViewerTable: SchemaViewerTableNode,
};

const EDGE_TYPES = {
  schemaViewerEdge: SchemaViewerEdge,
};

const PRO_OPTIONS = {
  hideAttribution: true,
};

// Animation duration shared with `zoomToNodes` so every camera move has the
// same feel (matches DURATION_MS in useZoomToNodes.ts).
const VIEWPORT_FIT_DURATION_MS = 500;

function viewportFitReducer(
  _state: PendingViewportFit | null,
  action: ViewportFitAction,
): PendingViewportFit | null {
  switch (action.type) {
    case "fitAll":
      return { kind: "all" };
    case "fitNodes":
      return action.nodeIds.length === 0
        ? null
        : { kind: "nodes", nodeIds: action.nodeIds };
    case "clear":
      return null;
  }
}

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

  // ReactFlow instance and state
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

  // Viewport-fit channel — sync/layout layer dispatches actions, the effect
  // below drains the resolved state using the captured ReactFlow instance.
  const [pendingViewportFit, dispatchViewportFit] = useReducer(
    viewportFitReducer,
    null,
  );

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
        if (!prev.has(n.data.table_id as ConcreteTableId)) {
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
      next.add(n.data.table_id as ConcreteTableId);
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

  // Lift selected edges above unselected ones so the highlighted edge
  // always renders on top of any edges that cross through it. Nodes are
  // pinned at zIndex 2 in `flow-graph.ts`, so the selected edge at zIndex 1
  // still renders below table cards — no overlap with node bodies.
  const edgesForRender = useMemo(
    () => (edges.some((e) => e.selected) ? edges.map(markSelectedEdge) : edges),
    [edges],
  );

  const hasDbSelected = databaseId != null;
  const { registerPendingEdgeSelection } = useGraphSync({
    hasDbSelected,
    error,
    isFetching,
    graph,
    nodes,
    contextKey,
    setNodes,
    setEdges,
    setExpandingTableIds,
    dispatchCameraFit: dispatchViewportFit,
  });

  const { relayout, focusOnNode } = useCanvasLayout({
    nodes,
    edges,
    setNodes,
    setEdges,
    dispatchViewportFit: dispatchViewportFit,
  });

  const { handleEdgeClick } = useEdgeZoom({
    dispatchViewportFit,
  });

  // Drain the pending viewport-fit request once React Flow has committed the
  // corresponding node/position changes. `requestAnimationFrame` lets
  // ReactFlow flush layout before we measure / fit.
  useEffect(() => {
    if (pendingViewportFit == null || reactFlowInstance == null) {
      return;
    }
    const handle = requestAnimationFrame(() => {
      if (pendingViewportFit.kind === "all") {
        reactFlowInstance.fitView({ duration: VIEWPORT_FIT_DURATION_MS });
      } else if (pendingViewportFit.nodeIds.length > 0) {
        zoomToNodes(reactFlowInstance, pendingViewportFit.nodeIds);
      }
      dispatchViewportFit({ type: "clear" });
    });
    return () => cancelAnimationFrame(handle);
  }, [pendingViewportFit, reactFlowInstance]);

  // --- Handlers -------------------------------------------------------------

  // FK click: persist the new focal table, mark its fetch as in-flight, and
  // queue the FK edge that triggered the expansion for auto-selection on
  // the next graph-sync run.
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
      if (
        candidateEdgeIdsToSelect != null &&
        candidateEdgeIdsToSelect.length > 0
      ) {
        registerPendingEdgeSelection(candidateEdgeIdsToSelect);
      }
    },
    [databaseId, onExtraTableIdAdd, registerPendingEdgeSelection],
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
        // Node selection and edge selection are conceptually exclusive in
        // this UI — the right-side info panel is about the node, not about
        // whichever edge happened to be highlighted before.
        setEdges((currentEdges) =>
          currentEdges.map((e) => (e.selected ? { ...e, selected: false } : e)),
        );
      }
    },
    [setEdges],
  );

  // Schema picker is about to push a new URL — drop selection-intent and
  // any pending camera fit so the new context starts clean.
  const handleSchemaChange = useCallback(() => {
    setSelectedNodeId(null);
    dispatchViewportFit({ type: "clear" });
  }, []);

  const schemaViewerContextValue = useMemo(
    () => ({
      visibleTableIds,
      expandingTableIds,
      onExpandToTable: handleExpandToTable,
      selectedNodeId,
      onSelectNode: handleSelectNode,
    }),
    [
      visibleTableIds,
      expandingTableIds,
      handleExpandToTable,
      selectedNodeId,
      handleSelectNode,
    ],
  );

  return (
    <SchemaViewerContext.Provider value={schemaViewerContextValue}>
      <ReactFlow
        className={S.reactFlow}
        nodes={nodes}
        edges={edgesForRender}
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
        <MiniMap position="bottom-right" pannable zoomable />

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
              <AutoLayoutButton onClick={relayout} />
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

        {isFetching && (
          <Box className={S.centerLoader}>
            <Loader />
          </Box>
        )}
        {error != null && (
          <Panel position="bottom-center">
            <Stack align="center" justify="center" mb="xl">
              <Text c="text-secondary">
                {getErrorMessage(error, t`Failed to load schema.`)}
              </Text>
            </Stack>
          </Panel>
        )}
        {!hasDbSelected && !isFetching && error == null && (
          <Panel position="top-center">
            <Stack align="center" justify="center" pt="xl">
              <Text c="text-tertiary">{t`Pick a database to view its schema`}</Text>
            </Stack>
          </Panel>
        )}
      </ReactFlow>
    </SchemaViewerContext.Provider>
  );
}
