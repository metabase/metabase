import type { Connection, OnBeforeDelete } from "@xyflow/react";
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useMemo,
} from "react";

import {
  type LadderKind,
  canConnect,
  connectWire,
  insertTailBlock,
  planDeletion,
  reconnectWire,
  redirectToTailHead,
  removeNodes,
} from "../graph";
import type { BuilderEdge, BuilderNode } from "../types";

type Options = {
  nodesRef: MutableRefObject<BuilderNode[]>;
  edgesRef: MutableRefObject<BuilderEdge[]>;
  setNodes: Dispatch<SetStateAction<BuilderNode[]>>;
  setEdges: Dispatch<SetStateAction<BuilderEdge[]>>;
  readOnly: boolean;
  scheduleFitView: () => void;
};

// Wires and blocks: everything that changes the shape of the graph. The
// rules live in the graph module; this only applies them to state.
export function useCanvasEditing({
  nodesRef,
  edgesRef,
  setNodes,
  setEdges,
  readOnly,
  scheduleFitView,
}: Options) {
  const graph = useCallback(
    () => ({ nodes: nodesRef.current, edges: edgesRef.current }),
    [nodesRef, edgesRef],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      const next = removeNodes(graph(), new Set([nodeId]));
      setNodes(next.nodes);
      setEdges(next.edges);
    },
    [graph, setNodes, setEdges],
  );

  const addTailBlock = useCallback(
    (kind: LadderKind, afterSummarizeId?: string) => {
      const next = insertTailBlock(graph(), kind, afterSummarizeId);
      if (!next) {
        return;
      }
      setNodes(next.nodes);
      setEdges(next.edges);
      // The chain just grew to the right; bring all of it back into view.
      scheduleFitView();
    },
    [graph, setNodes, setEdges, scheduleFitView],
  );

  // Blocks that work on a summarize's results go on the stage after it.
  const addStageBlock = useCallback(
    (summarizeNodeId: string, kind: LadderKind) =>
      addTailBlock(kind, summarizeNodeId),
    [addTailBlock],
  );

  const isValidConnection = useCallback(
    (connection: Connection | BuilderEdge) =>
      !readOnly && canConnect(connection, graph()),
    [readOnly, graph],
  );

  const connect = useCallback(
    (rawConnection: Connection) => {
      const connection = redirectToTailHead(rawConnection, graph());
      if (isValidConnection(connection)) {
        setEdges(connectWire(graph(), connection));
      }
    },
    [graph, isValidConnection, setEdges],
  );

  const reconnect = useCallback(
    (oldEdge: BuilderEdge, rawConnection: Connection) => {
      const connection = redirectToTailHead(rawConnection, graph());
      if (isValidConnection(connection)) {
        setEdges(reconnectWire(graph(), oldEdge, connection));
      }
    },
    [graph, isValidConnection, setEdges],
  );

  // The result block is permanent; everything else can go.
  const beforeDelete = useCallback<OnBeforeDelete<BuilderNode, BuilderEdge>>(
    async ({ nodes: toDelete, edges: edgesToDelete }) => {
      const { nodes, edges, bridges } = planDeletion(
        graph(),
        toDelete,
        edgesToDelete,
      );
      if (bridges.length > 0) {
        setEdges((prevEdges) => [...prevEdges, ...bridges]);
      }
      return { nodes, edges };
    },
    [graph, setEdges],
  );

  return useMemo(
    () => ({
      removeNode,
      addTailBlock,
      addStageBlock,
      isValidConnection,
      connect,
      reconnect,
      beforeDelete,
    }),
    [
      removeNode,
      addTailBlock,
      addStageBlock,
      isValidConnection,
      connect,
      reconnect,
      beforeDelete,
    ],
  );
}
