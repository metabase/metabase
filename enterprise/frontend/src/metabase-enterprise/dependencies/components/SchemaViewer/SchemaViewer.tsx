import {
  Background,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { skipToken, useListDatabaseSchemaTablesQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { usePalette } from "metabase/common/hooks/use-palette";
import { Group, Loader, Stack, Text, useColorScheme } from "metabase/ui";
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
import S from "./SchemaViewer.module.css";
import { SchemaPickerInput } from "./SchemaPickerInput";
import { TableSelectorInput } from "./TableSelectorInput";
import { SchemaViewerTableNode } from "./TableNode";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
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

const DEFAULT_HOPS = 2;

interface SchemaViewerProps {
  modelId: CardId | undefined;
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  initialTableIds: ConcreteTableId[] | undefined;
}

interface GetErdQueryParamsArgs extends SchemaViewerProps {
  hops: number;
  selectedTableIds: ConcreteTableId[] | null;
}

function getErdQueryParams({
  modelId,
  databaseId,
  schema,
  hops,
  selectedTableIds,
}: GetErdQueryParamsArgs): GetErdRequest | typeof skipToken {
  if (modelId != null) {
    return { "model-id": modelId, hops };
  }
  if (databaseId != null) {
    // Include table-ids when user has made a custom selection
    if (selectedTableIds != null && selectedTableIds.length > 0) {
      return schema != null
        ? { "database-id": databaseId, schema, "table-ids": selectedTableIds, hops }
        : { "database-id": databaseId, "table-ids": selectedTableIds, hops };
    }
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
}: SchemaViewerProps) {
  const [hops, setHops] = useState(DEFAULT_HOPS);
  // Store selection with its context (database/schema it belongs to)
  const [tableSelection, setTableSelection] = useState<{
    tableIds: ConcreteTableId[];
    forDatabaseId: DatabaseId;
    forSchema: string | undefined;
  } | null>(() => {
    // Initialize from URL params if provided
    if (initialTableIds != null && initialTableIds.length > 0 && databaseId != null) {
      return {
        tableIds: initialTableIds,
        forDatabaseId: databaseId,
        forSchema: schema,
      };
    }
    return null;
  });

  // Check if selection matches current database/schema
  const effectiveSelectedTableIds = useMemo(() => {
    if (tableSelection == null) {
      return null;
    }
    if (
      tableSelection.forDatabaseId !== databaseId ||
      tableSelection.forSchema !== schema
    ) {
      return null;
    }
    return tableSelection.tableIds;
  }, [tableSelection, databaseId, schema]);

  // Track if we've initialized from the initial ERD response for current context
  const currentContextKey =
    databaseId != null ? `${databaseId}:${schema ?? ""}` : null;
  const initializedContextRef = useRef<string | null>(
    // Mark as initialized if we got table IDs from URL
    initialTableIds != null && initialTableIds.length > 0 ? currentContextKey : null,
  );

  // Fetch all tables in the database/schema for the dropdown
  const { data: allTables, isFetching: isFetchingTables } =
    useListDatabaseSchemaTablesQuery(
      databaseId != null && schema != null
        ? { id: databaseId, schema }
        : skipToken,
    );

  const { data, isFetching, error } = useGetErdQuery(
    getErdQueryParams({
      modelId,
      databaseId,
      schema,
      hops,
      selectedTableIds: effectiveSelectedTableIds,
    }),
  );

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
        });
        initializedContextRef.current = currentContextKey;
      }
    }
  }, [data, isFetching, databaseId, schema, currentContextKey, effectiveSelectedTableIds]);

  const handleTableSelectionChange = useCallback(
    (tableIds: ConcreteTableId[]) => {
      if (databaseId != null) {
        setTableSelection({
          tableIds,
          forDatabaseId: databaseId,
          forSchema: schema,
        });
      }
    },
    [databaseId, schema],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaViewerFlowNode>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<SchemaViewerFlowEdge>(
    [],
  );
  const { colorScheme } = useColorScheme();
  const palette = usePalette();
  const hasEntry = modelId != null || databaseId != null;

  const markerEnd = useMemo(
    () => ({ type: MarkerType.Arrow, strokeWidth: 2, color: palette.border }),
    [palette.border],
  );

  const graph = useMemo(() => {
    if (data == null) {
      return null;
    }
    return toFlowGraph(data, markerEnd);
  }, [data, markerEnd]);

  useEffect(() => {
    // Clear everything when there's no entry selected
    if (!hasEntry || error != null) {
      setNodes([]);
      setEdges([]);
    } else if (graph != null) {
      setNodes(graph.nodes);
      setEdges(graph.edges);
    }
  }, [hasEntry, graph, error, setNodes, setEdges]);

  return (
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
    >
      <Background />
      <Controls showInteractive={false} />
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
              onSelectionChange={handleTableSelectionChange}
            />
          )}
          {effectiveSelectedTableIds != null &&
            effectiveSelectedTableIds.length > 0 &&
            edges.length > 0 && (
              <HopsInput value={hops} onChange={setHops} />
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
  );
}
