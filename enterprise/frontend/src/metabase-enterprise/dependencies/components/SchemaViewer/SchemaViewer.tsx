import {
  Background,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { usePalette } from "metabase/common/hooks/use-palette";
import * as Urls from "metabase/lib/urls";
import { Group, Loader, Stack, Text, useColorScheme } from "metabase/ui";
import { useGetErdQuery } from "metabase-enterprise/api";
import type {
  CardId,
  DatabaseId,
  DependencyNode,
  GetErdRequest,
  SearchModel,
  TableId,
} from "metabase-types/api";

import {
  GraphEntryInput,
  type PickerEntry,
  type SelectedEntry,
} from "../DependencyGraph/GraphEntryInput";

import S from "./SchemaViewer.module.css";
import { SchemaViewerEdge } from "./SchemaViewerEdge";
import { SchemaViewerNodeLayout } from "./SchemaViewerNodeLayout";
import { SchemaViewerNodeSearch } from "./SchemaViewerNodeSearch";
import { SchemaViewerTableNode } from "./SchemaViewerTableNode";
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

const SCHEMA_VIEWER_SEARCH_MODELS: SearchModel[] = ["table", "dataset"];
const SCHEMA_VIEWER_PICKER_MODELS: SearchModel[] = ["table", "dataset"];

interface SchemaViewerProps {
  tableId: TableId | undefined;
  modelId: CardId | undefined;
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
}

function getErdQueryParams({
  tableId,
  modelId,
  databaseId,
  schema,
}: SchemaViewerProps): GetErdRequest | typeof skipToken {
  if (modelId != null) {
    return { "model-id": modelId };
  }
  if (tableId != null) {
    return { "table-id": tableId };
  }
  if (databaseId != null) {
    return schema != null
      ? { "database-id": databaseId, schema }
      : { "database-id": databaseId };
  }
  return skipToken;
}

export function SchemaViewer({
  tableId,
  modelId,
  databaseId,
  schema,
}: SchemaViewerProps) {
  const { data, isFetching, error } = useGetErdQuery(
    getErdQueryParams({ tableId, modelId, databaseId, schema }),
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaViewerFlowNode>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<SchemaViewerFlowEdge>(
    [],
  );
  const { colorScheme } = useColorScheme();
  const palette = usePalette();
  const hasEntry = tableId != null || modelId != null || databaseId != null;

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

  // Find the focal node from the ERD data to display in the input
  const entryNode: DependencyNode | null = useMemo(() => {
    // Don't use cached data if there's no entry selected
    if (!hasEntry || data == null) {
      return null;
    }
    const focalNode = data.nodes.find((node) => node.is_focal);
    if (focalNode != null) {
      // Convert ERD node to DependencyNode format for display
      return {
        id: focalNode.table_id,
        type: "table" as const,
        data: {
          name: focalNode.name,
          display_name: focalNode.display_name,
          db_id: focalNode.db_id,
          schema: focalNode.schema,
        },
      };
    }
    return null;
  }, [hasEntry, data]);

  // For database/schema selections, create a simple selected entry for display
  const selectedEntry: SelectedEntry | null = useMemo(() => {
    // If we have a focal node, use that instead
    if (entryNode != null) {
      return null;
    }
    // Database/schema selection (no focal node)
    if (databaseId != null && schema != null) {
      return {
        label: schema,
        icon: "folder",
      };
    }
    if (databaseId != null) {
      return {
        label: t`Database ${databaseId}`,
        icon: "database",
      };
    }
    return null;
  }, [entryNode, databaseId, schema]);

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

  const getGraphUrl = useCallback((entry?: PickerEntry) => {
    if (entry == null) {
      return Urls.dataStudioErdBase();
    }
    if (entry.type === "card") {
      return Urls.dataStudioErdModel(entry.id as CardId);
    }
    if (entry.type === "database") {
      return Urls.dataStudioErdDatabase(entry.id as DatabaseId);
    }
    if (entry.type === "schema") {
      return Urls.dataStudioErdSchema(
        entry.databaseId as DatabaseId,
        entry.schema as string,
      );
    }
    return Urls.dataStudioErd(entry.id as TableId);
  }, []);

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
          <GraphEntryInput
            node={entryNode}
            selectedEntry={selectedEntry}
            isGraphFetching={isFetching}
            getGraphUrl={getGraphUrl}
            allowedSearchModels={SCHEMA_VIEWER_SEARCH_MODELS}
            pickerModels={SCHEMA_VIEWER_PICKER_MODELS}
          />
          <SchemaViewerNodeSearch nodes={nodes} />
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
        <Panel position="top-center">
          <Stack align="center" justify="center" mt="xl">
            <Text c="error">{t`Failed to load schema.`}</Text>
          </Stack>
        </Panel>
      )}
      {!hasEntry && !isFetching && error == null && (
        <Panel position="top-center">
          <Stack align="center" justify="center" pt="xl">
            <Text c="text-tertiary">{t`Search for a table or model to view its schema`}</Text>
          </Stack>
        </Panel>
      )}
    </ReactFlow>
  );
}
