import {
  Background,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
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
import { FitToCanvas } from "./components/FitToCanvas";
import { FitToNewNodes } from "./components/FitToNewNodes";
import { SchemaViewerNodeSearch } from "./components/NodeSearch";
import { SchemaPickerInput } from "./components/SchemaPickerInput";
import { SelectedNodeInfoPanel } from "./components/SelectedNodeInfoPanel";
import { SchemaViewerTableNode } from "./components/TableNode";
import { FIT_VIEW_OPTIONS, MAX_ZOOM, MIN_ZOOM } from "./constants";
import { useCanvasLayout } from "./hooks/useCanvasLayout";
import { useEdgeZoom } from "./hooks/useEdgeZoom";
import { useGraphSync } from "./hooks/useGraphSync";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "./types";
import { toFlowGraph } from "./utils";

// --- ReactFlow configuration ------------------------------------------------

const NODE_TYPES = {
  schemaViewerTable: SchemaViewerTableNode,
};

const EDGE_TYPES = {
  schemaViewerEdge: SchemaViewerEdge,
};

const PRO_OPTIONS = {
  hideAttribution: true,
};

// --- Props ------------------------------------------------------------------

type SchemaViewerProps = {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  /** Add a table to the extra focal set (FK click expansion). */
  onExtraTableIdAdd: (tableId: ConcreteTableId) => void;
  /** Stable key for the current (databaseId, schema). */
  contextKey: string | null;
  /** ERD response from `useGetErdQuery`. */
  data: ErdResponse | undefined;
  /** RTK-Query `isFetching` flag. */
  isFetching: boolean;
  /** RTK-Query error, if any. */
  error: unknown;
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
  // --- State ----------------------------------------------------------------

  // ReactFlow's node/edge stores. All canvas state derives from these.
  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaViewerFlowNode>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<SchemaViewerFlowEdge>(
    [],
  );

  // Camera-fit channels — set by the sync/layout layer, drained by
  // render-null components (`<FitToNewNodes>`, `<FitToCanvas>`) inside
  // `<ReactFlow>` (the only place `useReactFlow` is available).
  const [pendingFitNodeIds, setPendingFitNodeIds] = useState<
    readonly string[] | null
  >(null);
  const clearPendingFitNodeIds = useCallback(
    () => setPendingFitNodeIds(null),
    [],
  );
  const [pendingFreshFit, setPendingFreshFit] = useState<{
    duration?: number;
  } | null>(null);
  const clearPendingFreshFit = useCallback(() => setPendingFreshFit(null), []);

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

  // --- Derived values -------------------------------------------------------

  const { colorScheme } = useColorScheme();
  const hasEntry = databaseId != null;

  const visibleTableIds = useMemo(
    () => new Set(nodes.map((n) => n.data.table_id as ConcreteTableId)),
    [nodes],
  );

  const selectedNodeId = useMemo(
    () =>
      selectedNodeIdIntent != null &&
      nodes.some((n) => n.id === selectedNodeIdIntent)
        ? selectedNodeIdIntent
        : null,
    [nodes, selectedNodeIdIntent],
  );

  // ERD response → ReactFlow node/edge shape.
  const graph = useMemo(() => {
    if (data == null) {
      return null;
    }
    return toFlowGraph(data);
  }, [data]);

  // Lift selected edges above unselected ones so the highlighted edge
  // always renders on top of any edges that cross through it. We do this
  // by reordering the array (selected edges last) rather than setting a
  // high `zIndex` — high zIndex would promote the edge above the node
  // layer in React Flow, which makes it overlap node cards. Reordering
  // keeps the selected edge in the regular edges layer (below nodes) and
  // simply places it later in the SVG, which is sufficient because SVG
  // z-order is determined by DOM order.
  const edgesForRender = useMemo(() => {
    if (!edges.some((e) => e.selected)) {
      return edges;
    }
    const unselected: SchemaViewerFlowEdge[] = [];
    const selected: SchemaViewerFlowEdge[] = [];
    for (const edge of edges) {
      if (edge.selected) {
        selected.push(edge);
      } else {
        unselected.push(edge);
      }
    }
    return [...unselected, ...selected];
  }, [edges]);

  // --- Hooks (sync, layout actions, edge zoom) ------------------------------

  const { registerPendingEdgeSelection } = useGraphSync({
    hasEntry,
    error,
    isFetching,
    graph,
    nodes,
    contextKey,
    setNodes,
    setEdges,
    setExpandingTableIds,
    setPendingFitNodeIds,
    setPendingFreshFit,
  });

  const { relayout, focusOnNode } = useCanvasLayout({
    nodes,
    edges,
    setNodes,
    setEdges,
    setPendingFitNodeIds,
    setPendingFreshFit,
  });

  const { handleEdgeClick } = useEdgeZoom({ setPendingFitNodeIds });

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
    setPendingFreshFit(null);
  }, []);

  // --- Context value (consumed by TableNode, FieldRow, …) -------------------

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

  // --- Render ---------------------------------------------------------------

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
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
      >
        {/* Canvas chrome */}
        <Background />
        <MiniMap position="bottom-right" pannable zoomable />

        {/* Camera-op pumps (render-null) */}
        <FitToNewNodes
          nodeIds={pendingFitNodeIds}
          onDone={clearPendingFitNodeIds}
        />
        <FitToCanvas trigger={pendingFreshFit} onDone={clearPendingFreshFit} />

        {/* Top-left: context picker + search */}
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

        {/* Top-right: app switcher */}
        <Panel position="top-right">
          <AppSwitcher className={S.appSwitcher} />
        </Panel>

        {/* Bottom-left: layout controls (only when canvas has content) */}
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

        {/* Right side: selected-node info panel (renders its own <Panel>) */}
        <SelectedNodeInfoPanel
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          onClose={handleClearSelection}
        />

        {/* Status overlays */}
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
        {!hasEntry && !isFetching && error == null && (
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
