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
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import { useCanvasLayout } from "./hooks/useCanvasLayout";
import { useEdgeZoom } from "./hooks/useEdgeZoom";
import { useGraphSync } from "./hooks/useGraphSync";
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

const DEFAULT_ZOOM = 0.3;
const FIT_VIEW_OPTIONS = { minZoom: DEFAULT_ZOOM, maxZoom: DEFAULT_ZOOM };

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
  // IDs of tables the camera should fit/zoom to next. Populated in two
  // places: (1) the graph-sync effect when FK expansion adds new tables,
  // (2) the onEdgeClick handler to zoom to an edge's source/target.
  const [pendingFitNodeIds, setPendingFitNodeIds] = useState<
    readonly string[] | null
  >(null);
  const clearPendingFitNodeIds = useCallback(
    () => setPendingFitNodeIds(null),
    [],
  );

  // Bumped with a fresh trigger object whenever a full-canvas layout is
  // applied (fresh data via `useGraphSync`, or manual relayout via
  // `useCanvasLayout`). Consumed by `<FitToCanvas>` to call ReactFlow's
  // `fitView()` so the camera reframes to the new bounds.
  const [pendingFreshFit, setPendingFreshFit] = useState<{
    duration?: number;
  } | null>(null);
  const clearPendingFreshFit = useCallback(() => setPendingFreshFit(null), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaViewerFlowNode>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<SchemaViewerFlowEdge>(
    [],
  );
  const { colorScheme } = useColorScheme();
  const hasEntry = databaseId != null;

  // Set of currently visible table IDs on the canvas
  const visibleTableIds = useMemo(
    () => new Set(nodes.map((n) => n.data.table_id as ConcreteTableId)),
    [nodes],
  );

  // Target table IDs whose FK-expansion fetch is still in flight. Field rows
  // use this to swap the database-type text for a loader until the new table
  // arrives in the graph (or the fetch errors out / the context changes).
  const [expandingTableIds, setExpandingTableIds] = useState<
    Set<ConcreteTableId>
  >(() => new Set());

  const graph = useMemo(() => {
    if (data == null) {
      return null;
    }
    return toFlowGraph(data);
  }, [data]);

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

  // Handler for expanding to a related table via FK click
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
      // Stash the candidate edge IDs so the next graph-sync run can find
      // the FK edge that triggered this expansion and auto-select it.
      if (
        candidateEdgeIdsToSelect != null &&
        candidateEdgeIdsToSelect.length > 0
      ) {
        registerPendingEdgeSelection(candidateEdgeIdsToSelect);
      }
    },
    [databaseId, onExtraTableIdAdd, registerPendingEdgeSelection],
  );

  const { relayout, focusOnNode } = useCanvasLayout({
    nodes,
    edges,
    setNodes,
    setEdges,
    setPendingFitNodeIds,
    setPendingFreshFit,
  });

  // Track the node id most recently focused via the Focus node button so the
  // button can disable itself until the user selects a different node.
  const [lastFocusedNodeId, setLastFocusedNodeId] = useState<string | null>(
    null,
  );

  const handleFocusNode = useCallback(
    (nodeId: string) => {
      focusOnNode(nodeId);
      setLastFocusedNodeId(nodeId);
    },
    [focusOnNode],
  );

  const { handleEdgeClick } = useEdgeZoom({ setPendingFitNodeIds });

  // Selection is intent: the user picks a table and we remember that pick.
  // The visible selection (`selectedNodeId`) is derived during render, so
  // when the picked node temporarily disappears from the graph (schema
  // change, table removed, etc.) the info panel renders nothing — and if
  // the node returns later, selection lights up again without a follow-up
  // commit.
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

  const handleSchemaChange = useCallback(() => {
    setSelectedNodeId(null);
    setPendingFreshFit(null);
  }, []);

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
        <Background />
        <MiniMap position="bottom-right" pannable zoomable />
        <FitToNewNodes
          nodeIds={pendingFitNodeIds}
          onDone={clearPendingFitNodeIds}
        />
        <FitToCanvas trigger={pendingFreshFit} onDone={clearPendingFreshFit} />
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
