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
import {
  Group,
  Loader,
  Stack,
  Text,
  useColorScheme,
  useMantineTheme,
} from "metabase/ui";
import { useGetErdQuery } from "metabase-enterprise/api";
import type {
  CardId,
  DependencyEntry,
  GetErdRequest,
  SearchModel,
  TableId,
} from "metabase-types/api";

import { GraphEntryInput } from "../DependencyGraph/GraphEntryInput";

import S from "./Erd.module.css";
import { ErdEdge } from "./ErdEdge";
import { ErdNodeLayout } from "./ErdNodeLayout";
import { ErdNodeSearch } from "./ErdNodeSearch";
import { ErdTableNode } from "./ErdTableNode";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import type { ErdFlowEdge, ErdFlowNode } from "./types";
import { toFlowGraph } from "./utils";

const NODE_TYPES = {
  erdTable: ErdTableNode,
};

const EDGE_TYPES = {
  erdEdge: ErdEdge,
};

const PRO_OPTIONS = {
  hideAttribution: true,
};

const ERD_SEARCH_MODELS: SearchModel[] = ["table", "dataset"];
const ERD_PICKER_MODELS: ("table" | "dataset")[] = ["table", "dataset"];

interface ErdProps {
  tableId: TableId | undefined;
  modelId: CardId | undefined;
}

function getErdQueryParams(
  tableId: TableId | undefined,
  modelId: CardId | undefined,
): GetErdRequest | typeof skipToken {
  if (modelId != null) {
    return { "model-id": modelId };
  }
  if (tableId != null) {
    return { "table-id": tableId };
  }
  return skipToken;
}

export function Erd({ tableId, modelId }: ErdProps) {
  const { data, isFetching, error } = useGetErdQuery(
    getErdQueryParams(tableId, modelId),
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<ErdFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ErdFlowEdge>([]);
  const { colorScheme } = useColorScheme();
  const palette = usePalette();
  const theme = useMantineTheme();
  console.log({ palette, colorScheme, theme });
  const hasEntry = tableId != null || modelId != null;

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
    if (graph != null) {
      setNodes(graph.nodes);
      setEdges(graph.edges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [graph, setNodes, setEdges]);

  const getGraphUrl = useCallback((entry?: DependencyEntry) => {
    if (entry == null) {
      return Urls.dataStudioErdBase();
    }
    if (entry.type === "card") {
      return Urls.dataStudioErdModel(entry.id as CardId);
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
      {nodes.length > 0 && <ErdNodeLayout />}
      <Panel className={S.entryInput} position="top-left">
        <Group gap="sm">
          <GraphEntryInput
            node={null}
            isGraphFetching={isFetching}
            getGraphUrl={getGraphUrl}
            allowedSearchModels={ERD_SEARCH_MODELS}
            pickerModels={ERD_PICKER_MODELS}
          />
          <ErdNodeSearch nodes={nodes} />
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
          <Stack align="center" justify="center" pt="xl">
            <Text c="error">{t`Failed to load ERD`}</Text>
          </Stack>
        </Panel>
      )}
      {!hasEntry && !isFetching && error == null && (
        <Panel position="top-center">
          <Stack align="center" justify="center" pt="xl">
            <Text c="text-tertiary">{t`Search for a table or model to view its ERD`}</Text>
          </Stack>
        </Panel>
      )}
    </ReactFlow>
  );
}
