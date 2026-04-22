import { useClipboard } from "@mantine/hooks";
import {
  Background,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useListDatabaseSchemaTablesQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Menu,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  useColorScheme,
} from "metabase/ui";
import { useGetErdQuery } from "metabase-enterprise/api";
import type {
  ConcreteTableId,
  DatabaseId,
  DependencyId,
  Field,
  GetErdRequest,
  TableDependencyNode,
  TableDependencyNodeData,
} from "metabase-types/api";

import { GraphInfoPanel } from "../DependencyGraph/GraphInfoPanel";

import { SchemaViewerEdge } from "./Edge";
import { SchemaViewerNodeLayout } from "./NodeLayout";
import { SchemaViewerNodeSearch } from "./NodeSearch";
import { SchemaPickerInput } from "./SchemaPickerInput";
import S from "./SchemaViewer.module.css";
import { SchemaViewerContext } from "./SchemaViewerContext";
import { SchemaViewerTableNode } from "./TableNode";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "./types";
import { useSchemaViewerShareUrl } from "./useSchemaViewerShareUrl";
import { useZoomToNodes } from "./useZoomToNodes";
import {
  focusNodeLayout,
  getNodesWithPositions,
  mergeWithExistingPositions,
  toFlowGraph,
} from "./utils";

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

const DEFAULT_HOPS = 1;

interface FitToNewNodesProps {
  nodeIds: readonly string[] | null;
  onDone: () => void;
}

/**
 * When `nodeIds` is set to a non-empty list (e.g. by SchemaViewer when
 * tables have been added via FK expansion, or when an edge has been
 * double-clicked), pan/zoom the camera to the given nodes using the shared
 * {@link useZoomToNodes} rules (≥0.5 zoom, header in viewport). Calls
 * `onDone` once the zoom has been scheduled to clear the pending state.
 */
function FitToNewNodes({ nodeIds, onDone }: FitToNewNodesProps) {
  const zoomToNodes = useZoomToNodes();
  useEffect(() => {
    if (nodeIds == null || nodeIds.length === 0) {
      return;
    }
    // requestAnimationFrame to let React Flow commit any pending node
    // additions (and their measured dimensions) before we compute bounds.
    const handle = requestAnimationFrame(() => {
      zoomToNodes(nodeIds);
      onDone();
    });
    return () => cancelAnimationFrame(handle);
  }, [nodeIds, zoomToNodes, onDone]);
  return null;
}

/**
 * Re-runs the default Dagre layout on all currently-displayed nodes. Rendered
 * inside ReactFlow so it can use {@link useReactFlow} to read and replace
 * node state imperatively (React Flow's fitView can only run inside the
 * provider).
 */
function AutoLayoutButton() {
  const { getNodes, getEdges, setNodes, fitView } =
    useReactFlow<SchemaViewerFlowNode>();

  const handleClick = useCallback(() => {
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    if (currentNodes.length === 0) {
      return;
    }
    const laidOut = getNodesWithPositions(currentNodes, currentEdges);
    setNodes(laidOut);
    fitView({ nodes: laidOut, duration: 500 });
  }, [getNodes, getEdges, setNodes, fitView]);

  return (
    <Button
      bg="background-primary"
      variant="default"
      leftSection={<Icon name="sparkles" />}
      onClick={handleClick}
    >
      {t`Auto-layout`}
    </Button>
  );
}

/**
 * Wraps the shared GraphInfoPanel so it can live inside ReactFlow (where
 * useZoomToNodes is available) and adapt our ErdNode data into the
 * DependencyNode shape that GraphInfoPanel expects. Also handles:
 *  - onTitleClick: re-zoom onto the selected node
 *  - renderFieldExtras: append a clickable target-table name next to FK
 *    fields; clicking it pans to the linked table without dropping the
 *    current selection
 */
function SelectedNodeInfoPanel({
  nodes,
  selectedNodeId,
  onClose,
}: {
  nodes: SchemaViewerFlowNode[];
  selectedNodeId: string | null;
  onClose: () => void;
}) {
  const zoomToNodes = useZoomToNodes();

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

  const dependencyNode = useMemo(
    () => (selectedNode != null ? toTableDependencyNode(selectedNode) : null),
    [selectedNode],
  );

  const handleTitleClick = useCallback(() => {
    if (selectedNode != null) {
      zoomToNodes([selectedNode.id]);
    }
  }, [selectedNode, zoomToNodes]);

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
          <Text c="text-tertiary" fz="sm">
            →
          </Text>
          <UnstyledButton
            className={S.fkLink}
            c="brand"
            fz="sm"
            onClick={() => zoomToNodes([targetNode.id])}
          >
            {targetName}
          </UnstyledButton>
        </Group>
      );
    },
    [selectedNode, nodesByTableId, zoomToNodes],
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
 * by GraphInfoPanel. We deliberately leave the `db`/`transform`/`owner`
 * slots unset — the panel's optional sections degrade gracefully when they
 * are missing, and we don't carry that data in the ERD payload.
 */
function toTableDependencyNode(
  node: SchemaViewerFlowNode,
): TableDependencyNode {
  const data: TableDependencyNodeData = {
    name: node.data.name,
    display_name: node.data.display_name,
    description: null,
    db_id: node.data.db_id,
    schema: node.data.schema ?? "",
    fields: node.data.fields.map(
      (f) =>
        ({
          id: f.id,
          name: f.name,
          display_name: f.display_name,
          database_type: f.database_type,
          semantic_type: f.semantic_type ?? null,
          fk_target_field_id: f.fk_target_field_id ?? null,
        }) as unknown as Field,
    ),
  };
  return {
    id: Number(node.data.table_id) as DependencyId,
    type: "table",
    data,
  };
}

interface SchemaViewerProps {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  initialTableIds: ConcreteTableId[] | undefined;
  initialHops?: number;
}

interface GetErdQueryParamsArgs extends SchemaViewerProps {
  hops: number;
  selectedTableIds: ConcreteTableId[] | null;
  isUserModified: boolean;
}

function getErdQueryParams({
  databaseId,
  schema,
  hops,
  selectedTableIds,
  isUserModified,
}: GetErdQueryParamsArgs): GetErdRequest | typeof skipToken {
  if (databaseId == null) {
    return skipToken;
  }
  // User explicitly cleared all tables - show empty canvas
  if (
    isUserModified &&
    selectedTableIds != null &&
    selectedTableIds.length === 0
  ) {
    return skipToken;
  }
  const params: GetErdRequest = { "database-id": databaseId, hops };
  if (schema != null) {
    params.schema = schema;
  }
  // Include table-ids when user has made a custom selection
  if (
    isUserModified &&
    selectedTableIds != null &&
    selectedTableIds.length > 0
  ) {
    params["table-ids"] = selectedTableIds;
  }
  return params;
}

export function SchemaViewer({
  databaseId,
  schema,
  initialTableIds,
  initialHops,
}: SchemaViewerProps) {
  const [hops, setHops] = useState(initialHops ?? DEFAULT_HOPS);
  // IDs of tables the camera should fit/zoom to next. Populated in two
  // places: (1) the graph-sync effect when FK expansion adds new tables,
  // (2) the onEdgeDoubleClick handler to zoom to an edge's source/target.
  const [pendingFitNodeIds, setPendingFitNodeIds] = useState<
    readonly string[] | null
  >(null);
  const clearPendingFitNodeIds = useCallback(
    () => setPendingFitNodeIds(null),
    [],
  );
  // Per-edge memory of which endpoint the camera last zoomed to, so
  // successive double-clicks on the same edge alternate source → target.
  const lastEdgeZoomSideRef = useRef<Map<string, "source" | "target">>(
    new Map(),
  );
  // When the user expands a new table via FK click, these candidate IDs
  // hold the edge that should be auto-selected once the new graph arrives.
  // Stored as a ref (not state) so setting it doesn't trigger an extra
  // render — the sync effect just reads it on the next ERD response.
  const pendingEdgeIdsToSelectRef = useRef<readonly string[] | null>(null);

  // Persist table selection + hops per database:schema
  const prefsKey = databaseId != null ? `${databaseId}:${schema ?? ""}` : null;

  const {
    value: savedPrefs,
    setValue: setSavedPrefs,
    isLoading: isLoadingPrefs,
  } = useUserKeyValue({
    namespace: "schema_viewer",
    key: prefsKey ?? "",
    skip: prefsKey == null,
  });

  // Store selection with its context (database/schema it belongs to)
  // isUserModified: true when user has manually changed selection (vs auto-initialized from backend)
  const [tableSelection, setTableSelection] = useState<{
    tableIds: ConcreteTableId[];
    forDatabaseId: DatabaseId;
    forSchema: string | undefined;
    isUserModified: boolean;
  } | null>(() => {
    // Initialize from URL params if provided
    if (
      initialTableIds != null &&
      initialTableIds.length > 0 &&
      databaseId != null
    ) {
      return {
        tableIds: initialTableIds,
        forDatabaseId: databaseId,
        forSchema: schema,
        isUserModified: true, // URL params count as user-specified
      };
    }
    return null;
  });

  // Track previous prefsKey to detect database/schema changes synchronously
  // (effects fire too late and cause stale prefs to be applied to the new context)
  const prevPrefsKeyRef = useRef(prefsKey);

  // Check if selection matches current database/schema
  const effectiveSelection = useMemo(() => {
    if (tableSelection == null) {
      return null;
    }
    if (
      tableSelection.forDatabaseId !== databaseId ||
      tableSelection.forSchema !== schema
    ) {
      return null;
    }
    return {
      tableIds: tableSelection.tableIds,
      isUserModified: tableSelection.isUserModified,
    };
  }, [tableSelection, databaseId, schema]);

  const effectiveSelectedTableIds = effectiveSelection?.tableIds ?? null;
  const isUserModified = effectiveSelection?.isUserModified ?? false;

  // Track if we've initialized from the initial ERD response for current context
  const currentContextKey =
    databaseId != null ? `${databaseId}:${schema ?? ""}` : null;
  const initializedContextRef = useRef<string | null>(
    // Mark as initialized if we got table IDs from URL
    initialTableIds != null && initialTableIds.length > 0
      ? currentContextKey
      : null,
  );

  // Reset state synchronously during render when database/schema changes.
  // Using an effect for this causes a race: the prefs restoration effect fires
  // before the cleanup effect and applies stale savedPrefs to the new context.
  const appliedPrefsRef = useRef(false);
  if (prevPrefsKeyRef.current !== prefsKey) {
    prevPrefsKeyRef.current = prefsKey;
    appliedPrefsRef.current = false;
    initializedContextRef.current = null;
  }

  // Fetch all tables in the database/schema for the dropdown
  const { data: allTables, isFetching: isFetchingTables } =
    useListDatabaseSchemaTablesQuery(
      databaseId != null && schema != null
        ? { id: databaseId, schema }
        : skipToken,
    );

  // Wait for saved prefs AND allTables before firing the initial ERD query.
  // Defers the fetch until selection has been initialized (from saved prefs or
  // from allTables as "select all") to avoid a wasted fetch that would be
  // immediately replaced once the selection lands.
  const hasPendingPrefsToApply =
    !appliedPrefsRef.current &&
    savedPrefs != null &&
    typeof savedPrefs === "object" &&
    savedPrefs.table_ids != null;

  const shouldWaitForInitialLoad =
    databaseId != null &&
    initialTableIds == null &&
    effectiveSelectedTableIds === null &&
    (isLoadingPrefs || isFetchingTables);

  const { data, isFetching, error } = useGetErdQuery(
    shouldWaitForInitialLoad
      ? skipToken
      : getErdQueryParams({
          databaseId,
          schema,
          initialTableIds,
          hops,
          selectedTableIds: effectiveSelectedTableIds,
          isUserModified,
        }),
  );

  // Set of valid table IDs for the current schema (for validating saved prefs)
  const validTableIdSet = useMemo(() => {
    if (allTables == null) {
      return null;
    }
    return new Set(allTables.map((t) => t.id as ConcreteTableId));
  }, [allTables]);

  // Restore saved prefs once loaded (one-time per schema context)
  // Wait for allTables to validate that saved table IDs still exist
  useEffect(() => {
    if (
      !appliedPrefsRef.current &&
      !isLoadingPrefs &&
      !isFetchingTables &&
      savedPrefs != null &&
      typeof savedPrefs === "object" &&
      savedPrefs.table_ids != null &&
      validTableIdSet != null &&
      initialTableIds == null && // URL params take priority
      databaseId != null
    ) {
      appliedPrefsRef.current = true;

      // Filter out table IDs that no longer exist in the schema
      const validatedTableIds = (
        savedPrefs.table_ids as ConcreteTableId[]
      ).filter((id) => validTableIdSet.has(id));

      if (validatedTableIds.length > 0) {
        setHops(savedPrefs.hops);
        setTableSelection({
          tableIds: validatedTableIds,
          forDatabaseId: databaseId,
          forSchema: schema,
          isUserModified: true, // Saved prefs = previous user choices
        });
        initializedContextRef.current = currentContextKey; // Prevent auto-init overwrite
      }
      // If no valid table IDs remain, don't set selection - let backend pick focal tables
    }
  }, [
    isLoadingPrefs,
    isFetchingTables,
    savedPrefs,
    validTableIdSet,
    initialTableIds,
    databaseId,
    schema,
    currentContextKey,
  ]);

  // Initialize selection to ALL tables in the schema on first visit
  // (when there are no URL params and no saved prefs to restore)
  useEffect(() => {
    if (
      allTables != null &&
      !isFetchingTables &&
      databaseId != null &&
      initializedContextRef.current !== currentContextKey &&
      effectiveSelectedTableIds === null &&
      !hasPendingPrefsToApply
    ) {
      const allTableIds = allTables.map((t) => t.id as ConcreteTableId);
      if (allTableIds.length > 0) {
        setTableSelection({
          tableIds: allTableIds,
          forDatabaseId: databaseId,
          forSchema: schema,
          isUserModified: true, // Treat as user-specified so ERD query sends table-ids
        });
        initializedContextRef.current = currentContextKey;
      }
    }
  }, [
    allTables,
    isFetchingTables,
    databaseId,
    schema,
    currentContextKey,
    effectiveSelectedTableIds,
    hasPendingPrefsToApply,
  ]);

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

  // Handler for expanding to a related table via FK click
  const handleExpandToTable = useCallback(
    (
      tableId: ConcreteTableId,
      candidateEdgeIdsToSelect?: readonly string[],
    ) => {
      if (effectiveSelectedTableIds != null && databaseId != null) {
        const newTableIds = [...effectiveSelectedTableIds, tableId];
        setTableSelection({
          tableIds: newTableIds,
          forDatabaseId: databaseId,
          forSchema: schema,
          isUserModified: true, // User clicked to expand
        });
        setSavedPrefs({
          table_ids: newTableIds,
          hops,
        });
        // Stash the candidate edge IDs so the next graph-sync run can find
        // the FK edge that triggered this expansion and auto-select it.
        if (
          candidateEdgeIdsToSelect != null &&
          candidateEdgeIdsToSelect.length > 0
        ) {
          pendingEdgeIdsToSelectRef.current = candidateEdgeIdsToSelect;
        }
      }
    },
    [effectiveSelectedTableIds, databaseId, schema, hops, setSavedPrefs],
  );

  const shareUrl = useSchemaViewerShareUrl({
    databaseId,
    schema,
    tableIds: effectiveSelectedTableIds,
    hops,
  });
  const clipboard = useClipboard({ timeout: 2000 });

  const handleShare = useCallback(() => {
    if (shareUrl != null) {
      clipboard.copy(shareUrl);
    }
  }, [clipboard, shareUrl]);

  // Clear the canvas whenever the database/schema context changes, regardless
  // of how it was changed (picker click, direct URL navigation, history
  // back/forward). Without this, the previous schema's nodes linger on screen
  // until the new fetch resolves and the sync effect replaces them.
  const prevContextForClearRef = useRef(currentContextKey);
  useEffect(() => {
    if (prevContextForClearRef.current !== currentContextKey) {
      prevContextForClearRef.current = currentContextKey;
      setNodes([]);
      setEdges([]);
    }
  }, [currentContextKey, setNodes, setEdges]);

  // Right-click on a table node opens a context menu at the cursor. Tracked
  // as a single piece of state so the menu is controlled from React (rather
  // than wired through each individual node).
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: SchemaViewerFlowNode) => {
      event.preventDefault();
      setNodeContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      });
    },
    [],
  );

  const closeNodeContextMenu = useCallback(() => {
    setNodeContextMenu(null);
  }, []);

  const handleFocusNode = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) => {
        const laidOut = focusNodeLayout(
          nodeId,
          currentNodes,
          edges.map((edge) => ({ source: edge.source, target: edge.target })),
        );
        // Clear any previous node selection so the fresh layout starts from
        // a clean slate.
        return laidOut.map((n) => (n.selected ? { ...n, selected: false } : n));
      });
      // Drop any edge highlighting from before the rearrangement.
      setEdges((currentEdges) =>
        currentEdges.map((e) => (e.selected ? { ...e, selected: false } : e)),
      );
      // Zoom in on the focal node itself — useZoomToNodes clamps to ≥0.5 so
      // the table stays legible, and keeps the node's header in view.
      setPendingFitNodeIds([nodeId]);
      setNodeContextMenu(null);
    },
    [edges, setNodes, setEdges],
  );

  // Double-click on an edge: alternate between zooming to the source node
  // (first double-click, or any time the previous was "target") and the
  // target node (when the previous was "source"). The edge stays selected
  // — fitView doesn't touch React Flow's selection state.
  const handleEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: SchemaViewerFlowEdge) => {
      const previousSide = lastEdgeZoomSideRef.current.get(edge.id);
      const nextSide: "source" | "target" =
        previousSide === "source" ? "target" : "source";
      lastEdgeZoomSideRef.current.set(edge.id, nextSide);
      const targetNodeId = nextSide === "source" ? edge.source : edge.target;
      setPendingFitNodeIds([targetNodeId]);
    },
    [],
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
      onExpandToTable: handleExpandToTable,
      selectedNodeId,
      onSelectNode: handleSelectNode,
    }),
    [visibleTableIds, handleExpandToTable, selectedNodeId, handleSelectNode],
  );

  // Drop a stale selection when the selected node disappears from the graph
  // (schema change, table removed, etc.). Without this, the info panel would
  // keep rendering against a node that no longer exists.
  useEffect(() => {
    if (
      selectedNodeId != null &&
      !nodes.some((node) => node.id === selectedNodeId)
    ) {
      setSelectedNodeId(null);
    }
  }, [nodes, selectedNodeId]);

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

  // User explicitly cleared all tables - show empty canvas
  const isExplicitlyEmpty =
    isUserModified &&
    effectiveSelectedTableIds != null &&
    effectiveSelectedTableIds.length === 0;

  // Latest nodes held in a ref so the sync effect below can read current
  // state without adding `nodes` to its dependency array (which would cause
  // the effect to re-run on every internal React Flow node change — like
  // drags or position tweaks — and incorrectly re-merge against the result
  // of its own previous run).
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  useEffect(() => {
    // Clear everything when there's no entry selected or user cleared all tables
    if (!hasEntry || error != null || isExplicitlyEmpty) {
      setNodes([]);
      setEdges([]);
      return;
    }
    if (isFetching || graph == null) {
      return;
    }

    // If we expanded via FK click and a matching edge has now arrived in
    // the new graph, mark it as selected — the existing edge-selection
    // plumbing (stroke color, node `.selected` class, z-index lift) will
    // light up the connecting edge AND both connected nodes automatically.
    let nextEdges: SchemaViewerFlowEdge[] = graph.edges;
    const pendingEdgeIds = pendingEdgeIdsToSelectRef.current;
    if (pendingEdgeIds != null) {
      const matchedId = pendingEdgeIds.find((candidate) =>
        graph.edges.some((e) => e.id === candidate),
      );
      if (matchedId != null) {
        nextEdges = graph.edges.map((e) =>
          e.id === matchedId ? { ...e, selected: true } : e,
        );
        pendingEdgeIdsToSelectRef.current = null;
      }
    }
    setEdges(nextEdges);

    // Merge incoming nodes with current positions so an incremental expansion
    // (e.g. clicking an FK to fetch a related table) doesn't blank the canvas
    // by replacing every node with a fresh opacity-0 copy. Falls back to the
    // fresh graph for first loads, schema switches, removals, or disconnected
    // new nodes — those still go through the normal Dagre relayout path.
    const currentNodes = nodesRef.current;
    const currentById = new Map(currentNodes.map((n) => [n.id, n]));
    const merged = mergeWithExistingPositions(
      graph.nodes,
      currentNodes,
      graph.edges,
    );

    let nextNodes: SchemaViewerFlowNode[];
    if (merged != null) {
      nextNodes = merged;
    } else if (currentNodes.length === 0) {
      // First load — fresh layout path, nothing to preserve.
      nextNodes = graph.nodes;
    } else {
      const hasOverlap = graph.nodes.some((n) => currentById.has(n.id));
      if (!hasOverlap) {
        // Schema switch — fresh layout path.
        nextNodes = graph.nodes;
      } else {
        // Incremental change that the merge couldn't handle. For each
        // incoming node: if it was already on the canvas, preserve its
        // previous `is_focal` (the backend may re-rank focal tables when the
        // selection grows, and we don't want existing nodes to light up as a
        // side effect of the user clicking a FK somewhere else); if it's a
        // brand-new table reached by exploring, strip `is_focal` so it
        // doesn't get the highlighted border either.
        nextNodes = graph.nodes.map((node) => {
          const existing = currentById.get(node.id);
          if (existing != null) {
            return {
              ...node,
              data: { ...node.data, is_focal: existing.data.is_focal },
            };
          }
          return { ...node, data: { ...node.data, is_focal: false } };
        });
      }
    }

    setNodes(nextNodes);

    // If this was an incremental add (there was a current canvas and some of
    // it carried over), queue up a fitView on the newly-added tables so the
    // camera pans to wherever they landed.
    if (currentNodes.length > 0) {
      const addedIds = nextNodes
        .filter((n) => !currentById.has(n.id))
        .map((n) => n.id);
      if (addedIds.length > 0) {
        setPendingFitNodeIds(addedIds);
      }
    }
  }, [
    hasEntry,
    graph,
    error,
    isExplicitlyEmpty,
    isFetching,
    setNodes,
    setEdges,
  ]);

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
        onEdgeDoubleClick={handleEdgeDoubleClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={closeNodeContextMenu}
      >
        <Background />
        <MiniMap position="bottom-right" pannable zoomable />
        {/* <Controls showInteractive={false} /> */}
        <FitToNewNodes
          nodeIds={pendingFitNodeIds}
          onDone={clearPendingFitNodeIds}
        />
        <Panel position="top-right">
          <Group gap="sm">
            {shareUrl != null && (
              <Tooltip
                label={
                  <Text fw={700} c="inherit">
                    {clipboard.copied ? t`Copied!` : t`Share this schema`}
                  </Text>
                }
                opened={clipboard.copied ? true : undefined}
              >
                <ActionIcon
                  variant="default"
                  onClick={handleShare}
                  aria-label={t`Copy link`}
                >
                  <Icon name="link" />
                </ActionIcon>
              </Tooltip>
            )}
            <AppSwitcher className={S.appSwitcher} />
          </Group>
        </Panel>
        {nodes.length > 0 && <SchemaViewerNodeLayout />}
        {nodes.length > 0 && (
          <Panel position="bottom-left">
            <AutoLayoutButton />
          </Panel>
        )}
        <SelectedNodeInfoPanel
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          onClose={handleClearSelection}
        />
        <Panel className={S.entryInput} position="top-left">
          <Group gap="sm">
            <SchemaPickerInput databaseId={databaseId} schema={schema} />
            <SchemaViewerNodeSearch
              key={currentContextKey ?? ""}
              nodes={nodes}
            />
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
      {nodeContextMenu != null && (
        <Menu
          opened
          position="bottom-start"
          offset={2}
          onChange={(opened) => {
            if (!opened) {
              setNodeContextMenu(null);
            }
          }}
        >
          <Menu.Target>
            <div
              style={{
                position: "fixed",
                left: nodeContextMenu.x,
                top: nodeContextMenu.y,
                width: 1,
                height: 1,
                pointerEvents: "none",
              }}
            />
          </Menu.Target>
          <Menu.Dropdown p={0}>
            <Menu.Item
              fz="sm"
              fw="bold"
              rightSection={<Icon name="eye_outline" c="text-tertiary" />}
              onClick={() => handleFocusNode(nodeContextMenu.nodeId)}
            >
              {t`Focus node`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </SchemaViewerContext.Provider>
  );
}
