import { useClipboard } from "@mantine/hooks";
import {
  Background,
  ControlButton,
  Controls,
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
import {
  ActionIcon,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Tooltip,
  useColorScheme,
} from "metabase/ui";
import { useGetErdQuery } from "metabase-enterprise/api";
import type {
  CardId,
  ConcreteTableId,
  DatabaseId,
  GetErdRequest,
} from "metabase-types/api";

import { SchemaViewerEdge } from "./Edge";
import { HopsInput } from "./HopsInput";
import { SchemaViewerNodeLayout } from "./NodeLayout";
import { SchemaPickerInput } from "./SchemaPickerInput";
import S from "./SchemaViewer.module.css";
import { SchemaViewerContext } from "./SchemaViewerContext";
import { SchemaViewerTableNode } from "./TableNode";
import { TableSelectorInput } from "./TableSelectorInput";
import { COMPACT_ZOOM_THRESHOLD, MAX_ZOOM, MIN_ZOOM } from "./constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "./types";
import { useSchemaViewerShareUrl } from "./useSchemaViewerShareUrl";
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

const DEFAULT_HOPS = 2;

interface CompactModeToggleProps {
  isCompactMode: boolean;
  onToggle: () => void;
}

function CompactModeToggle({
  isCompactMode,
  onToggle,
}: CompactModeToggleProps) {
  const { fitView } = useReactFlow();

  const handleClick = useCallback(() => {
    onToggle();
    // When switching to compact mode, fit the view to show whole schema
    if (!isCompactMode) {
      // Use setTimeout to allow layout to update before fitting view
      setTimeout(() => {
        fitView();
      }, 0);
    }
  }, [isCompactMode, onToggle, fitView]);

  return (
    <ControlButton
      onClick={handleClick}
      title={isCompactMode ? t`Switch to full mode` : t`Switch to compact mode`}
    >
      <Icon name={isCompactMode ? "expand" : "contract"} />
    </ControlButton>
  );
}

interface SchemaViewerProps {
  modelId: CardId | undefined;
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
  modelId,
  databaseId,
  schema,
  hops,
  selectedTableIds,
  isUserModified,
}: GetErdQueryParamsArgs): GetErdRequest | typeof skipToken {
  if (modelId != null) {
    return { "model-id": modelId, hops };
  }
  if (databaseId != null) {
    // User explicitly cleared all tables - show empty canvas
    if (
      isUserModified &&
      selectedTableIds != null &&
      selectedTableIds.length === 0
    ) {
      return skipToken;
    }
    // Include table-ids when user has made a custom selection
    if (
      isUserModified &&
      selectedTableIds != null &&
      selectedTableIds.length > 0
    ) {
      return schema != null
        ? {
            "database-id": databaseId,
            schema,
            "table-ids": selectedTableIds,
            hops,
          }
        : { "database-id": databaseId, "table-ids": selectedTableIds, hops };
    }
    // Initial fetch or auto-initialized - let backend determine "most relationships"
    return schema != null
      ? { "database-id": databaseId, schema, hops }
      : { "database-id": databaseId, hops };
  }
  return skipToken;
}

export function SchemaViewer({
  modelId,
  databaseId,
  schema,
  initialTableIds,
  initialHops,
}: SchemaViewerProps) {
  const [hops, setHops] = useState(initialHops ?? DEFAULT_HOPS);
  const [isCompactMode, setIsCompactMode] = useState(false);

  // Persist table selection + hops per database:schema
  const prefsKey =
    modelId == null && databaseId != null
      ? `${databaseId}:${schema ?? ""}`
      : null;

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
  const compactModeInitializedRef = useRef<string | null>(null);
  if (prevPrefsKeyRef.current !== prefsKey) {
    prevPrefsKeyRef.current = prefsKey;
    appliedPrefsRef.current = false;
    initializedContextRef.current = null;
    compactModeInitializedRef.current = null;
  }

  // Fetch all tables in the database/schema for the dropdown
  const { data: allTables, isFetching: isFetchingTables } =
    useListDatabaseSchemaTablesQuery(
      databaseId != null && schema != null
        ? { id: databaseId, schema }
        : skipToken,
    );

  // Wait for saved prefs (and table validation) before firing the initial ERD query
  // to avoid a wasted fetch that would be immediately replaced by restored prefs
  const hasPendingPrefsToApply =
    !appliedPrefsRef.current &&
    savedPrefs != null &&
    typeof savedPrefs === "object" &&
    savedPrefs.table_ids != null;

  const shouldWaitForPrefs =
    initialTableIds == null &&
    databaseId != null &&
    (isLoadingPrefs || (hasPendingPrefsToApply && isFetchingTables));

  const { data, isFetching, error } = useGetErdQuery(
    shouldWaitForPrefs
      ? skipToken
      : getErdQueryParams({
          modelId,
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

  // Restore compact mode preference early (don't wait for table validation)
  useEffect(() => {
    if (
      !appliedPrefsRef.current &&
      !isLoadingPrefs &&
      savedPrefs != null &&
      typeof savedPrefs === "object" &&
      typeof savedPrefs.is_compact_mode === "boolean" &&
      initialTableIds == null &&
      databaseId != null
    ) {
      setIsCompactMode(savedPrefs.is_compact_mode);
      compactModeInitializedRef.current = currentContextKey;
    }
  }, [
    isLoadingPrefs,
    savedPrefs,
    initialTableIds,
    databaseId,
    currentContextKey,
  ]);

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

  // Initialize selected table IDs from initial ERD response (focal tables)
  // Only run when data is fresh (not fetching) to avoid using cached data from previous context
  useEffect(() => {
    if (
      data != null &&
      !isFetching &&
      databaseId != null &&
      initializedContextRef.current !== currentContextKey &&
      effectiveSelectedTableIds === null
    ) {
      const focalTableIds = data.nodes
        .filter((node) => node.is_focal)
        .map((node) => node.table_id as ConcreteTableId);
      if (focalTableIds.length > 0) {
        setTableSelection({
          tableIds: focalTableIds,
          forDatabaseId: databaseId,
          forSchema: schema,
          isUserModified: false, // Auto-initialized from backend
        });
        initializedContextRef.current = currentContextKey;
      }
    }
  }, [
    data,
    isFetching,
    databaseId,
    schema,
    currentContextKey,
    effectiveSelectedTableIds,
  ]);

  const handleTableSelectionChange = useCallback(
    (tableIds: ConcreteTableId[]) => {
      if (databaseId != null) {
        setTableSelection({
          tableIds,
          forDatabaseId: databaseId,
          forSchema: schema,
          isUserModified: true, // User made a manual change
        });
        setSavedPrefs({
          table_ids: tableIds,
          hops,
          is_compact_mode: isCompactMode,
        });
      }
    },
    [databaseId, schema, hops, isCompactMode, setSavedPrefs],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaViewerFlowNode>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<SchemaViewerFlowEdge>(
    [],
  );
  const { colorScheme } = useColorScheme();
  const hasEntry = modelId != null || databaseId != null;

  // Set of currently visible table IDs on the canvas
  const visibleTableIds = useMemo(
    () => new Set(nodes.map((n) => n.data.table_id)),
    [nodes],
  );

  const handleHopsChange = useCallback(
    (newHops: number) => {
      setHops(newHops);
      if (isUserModified && effectiveSelectedTableIds != null) {
        setSavedPrefs({
          table_ids: effectiveSelectedTableIds,
          hops: newHops,
          is_compact_mode: isCompactMode,
        });
      }
    },
    [isUserModified, effectiveSelectedTableIds, isCompactMode, setSavedPrefs],
  );

  // Handler for expanding to a related table via FK click
  const handleExpandToTable = useCallback(
    (tableId: ConcreteTableId) => {
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
          is_compact_mode: isCompactMode,
        });
      }
    },
    [
      effectiveSelectedTableIds,
      databaseId,
      schema,
      hops,
      isCompactMode,
      setSavedPrefs,
    ],
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

  const handleToggleCompactMode = useCallback(() => {
    setIsCompactMode((prev) => {
      const newMode = !prev;
      // Save preference when user manually toggles
      // Save compact mode preference regardless of table selection state
      if (effectiveSelectedTableIds != null) {
        setSavedPrefs({
          table_ids: effectiveSelectedTableIds,
          hops,
          is_compact_mode: newMode,
        });
      } else if (prefsKey != null) {
        // If no table selection yet, save just the compact mode preference
        setSavedPrefs({ is_compact_mode: newMode });
      }
      return newMode;
    });
  }, [effectiveSelectedTableIds, hops, prefsKey, setSavedPrefs]);

  const handleMove = useCallback(
    (_event: unknown, viewport: { zoom: number }) => {
      // Auto-switch from compact to regular when zooming in past threshold
      if (isCompactMode && viewport.zoom >= COMPACT_ZOOM_THRESHOLD) {
        setIsCompactMode(false);
        // Save preference when auto-switching to regular mode
        if (effectiveSelectedTableIds != null) {
          setSavedPrefs({
            table_ids: effectiveSelectedTableIds,
            hops,
            is_compact_mode: false,
          });
        } else if (prefsKey != null) {
          setSavedPrefs({ is_compact_mode: false });
        }
      }
    },
    [isCompactMode, effectiveSelectedTableIds, hops, prefsKey, setSavedPrefs],
  );

  const schemaViewerContextValue = useMemo(
    () => ({
      visibleTableIds,
      onExpandToTable: handleExpandToTable,
      isCompactMode,
    }),
    [visibleTableIds, handleExpandToTable, isCompactMode],
  );

  const graph = useMemo(() => {
    if (data == null) {
      return null;
    }
    return toFlowGraph(data);
  }, [data]);

  // Determine initial compact mode when data first loads for a schema
  useEffect(() => {
    debugger;
    if (
      data != null &&
      compactModeInitializedRef.current !== currentContextKey
    ) {
      compactModeInitializedRef.current = currentContextKey;
      const tablesWithManyFields = data.nodes.filter(
        (node) => node.fields.length > 20,
      ).length;
      const shouldStartCompact = tablesWithManyFields > 1;
      setIsCompactMode(shouldStartCompact);
    }
  }, [data, currentContextKey]);

  // User explicitly cleared all tables - show empty canvas
  const isExplicitlyEmpty =
    isUserModified &&
    effectiveSelectedTableIds != null &&
    effectiveSelectedTableIds.length === 0;

  useEffect(() => {
    // Clear everything when there's no entry selected or user cleared all tables
    if (!hasEntry || error != null || isExplicitlyEmpty) {
      setNodes([]);
      setEdges([]);
    } else if (graph != null) {
      setNodes(graph.nodes);
      setEdges(graph.edges);
    }
  }, [hasEntry, graph, error, isExplicitlyEmpty, setNodes, setEdges]);

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
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onMove={handleMove}
      >
        <Background />
        <Controls showInteractive={false}>
          <CompactModeToggle
            isCompactMode={isCompactMode}
            onToggle={handleToggleCompactMode}
          />
        </Controls>
        {shareUrl != null && (
          <Panel position="top-right">
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
          </Panel>
        )}
        {nodes.length > 0 && <SchemaViewerNodeLayout />}
        <Panel className={S.entryInput} position="top-left">
          <Group gap="sm">
            <SchemaPickerInput
              databaseId={databaseId}
              schema={schema}
              isLoading={isFetching}
            />
            {effectiveSelectedTableIds != null && (
              <TableSelectorInput
                nodes={nodes}
                allTables={isFetchingTables ? [] : (allTables ?? [])}
                selectedTableIds={effectiveSelectedTableIds}
                isUserModified={isUserModified}
                onSelectionChange={handleTableSelectionChange}
              />
            )}
            {effectiveSelectedTableIds != null &&
              effectiveSelectedTableIds.length > 0 && (
                <HopsInput value={hops} onChange={handleHopsChange} />
              )}
          </Group>
        </Panel>
        {isFetching && (
          <Panel position="top-center">
            <Stack align="center" justify="center" pt="xl">
              <Loader />
            </Stack>
          </Panel>
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
