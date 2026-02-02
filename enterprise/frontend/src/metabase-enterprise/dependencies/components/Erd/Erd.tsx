import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useEffect, useMemo } from "react";
import { goBack } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import {
  ActionIcon,
  Box,
  Icon,
  Loader,
  Stack,
  Text,
  Tooltip,
  useColorScheme,
} from "metabase/ui";
import { useGetErdQuery } from "metabase-enterprise/api";
import type { TableId } from "metabase-types/api";

import S from "./Erd.module.css";
import { ErdEdge } from "./ErdEdge";
import { ErdNodeLayout } from "./ErdNodeLayout";
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

interface ErdProps {
  tableId: TableId | undefined;
}

export function Erd({ tableId }: ErdProps) {
  const dispatch = useDispatch();
  const { data, isFetching, error } = useGetErdQuery(
    tableId != null ? { "table-id": tableId } : skipToken,
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<ErdFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ErdFlowEdge>([]);
  const { colorScheme } = useColorScheme();

  const graph = useMemo(() => {
    if (data == null) {
      return null;
    }
    return toFlowGraph(data);
  }, [data]);

  useEffect(() => {
    if (graph != null) {
      setNodes(graph.nodes);
      setEdges(graph.edges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [graph, setNodes, setEdges]);

  if (isFetching) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Loader />
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="error">{t`Failed to load ERD`}</Text>
      </Stack>
    );
  }

  if (tableId == null) {
    return null;
  }

  return (
    <Box className={S.container}>
      <Tooltip label={t`Back`}>
        <ActionIcon
          className={S.backButton}
          variant="outline"
          radius="xl"
          size="2.625rem"
          color="border"
          aria-label={t`Back`}
          onClick={() => dispatch(goBack())}
        >
          <Icon c="text-primary" name="arrow_left" />
        </ActionIcon>
      </Tooltip>
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
        <ErdNodeLayout />
      </ReactFlow>
    </Box>
  );
}
