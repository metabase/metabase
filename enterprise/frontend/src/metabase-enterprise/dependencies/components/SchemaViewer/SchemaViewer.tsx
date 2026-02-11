import {
  Background,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { usePalette } from "metabase/common/hooks/use-palette";
import { Group, Loader, Stack, Text, useColorScheme } from "metabase/ui";
import { useGetErdQuery } from "metabase-enterprise/api";
import type {
  CardId,
  DatabaseId,
  GetErdRequest,
  TableId,
} from "metabase-types/api";

import { SchemaViewerEdge } from "./Edge";
import { SchemaViewerNodeLayout } from "./NodeLayout";
import { SchemaViewerNodeSearch } from "./NodeSearch";
import S from "./SchemaViewer.module.css";
import { SchemaPickerInput } from "./SchemaPickerInput";
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
            <Text c="text-tertiary">{t`Pick a database to view its schema`}</Text>
          </Stack>
        </Panel>
      )}
    </ReactFlow>
  );
}
