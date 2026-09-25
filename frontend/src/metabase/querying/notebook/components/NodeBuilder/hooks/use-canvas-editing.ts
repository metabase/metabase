import type { Connection, OnBeforeDelete, OnConnectEnd } from "@xyflow/react";
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useMemo,
} from "react";

import {
  type BlockKind,
  trackNodeBuilderBlockRemoved,
  trackNodeBuilderWireConnected,
  trackNodeBuilderWireRejected,
} from "../analytics";
import {
  RESULT_NODE_ID,
  connectWire,
  isValidConnection as isValidWire,
  reconnectWire,
  removeNodes,
} from "../graph";
import type { BuilderEdge, BuilderNode } from "../types";

type Options = {
  nodesRef: MutableRefObject<BuilderNode[]>;
  edgesRef: MutableRefObject<BuilderEdge[]>;
  setNodes: Dispatch<SetStateAction<BuilderNode[]>>;
  setEdges: Dispatch<SetStateAction<BuilderEdge[]>>;
  readOnly: boolean;
};

// Wires and blocks: everything that changes the shape of the graph. The
// rules live in the graph module; this only applies them to state.
export function useCanvasEditing({
  nodesRef,
  edgesRef,
  setNodes,
  setEdges,
  readOnly,
}: Options) {
  const graph = useCallback(
    () => ({ nodes: nodesRef.current, edges: edgesRef.current }),
    [nodesRef, edgesRef],
  );

  const kindOf = useCallback(
    (nodeId: string | null | undefined): BlockKind | null =>
      nodesRef.current.find((node) => node.id === nodeId)?.type ?? null,
    [nodesRef],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      const kind = kindOf(nodeId);
      const next = removeNodes(graph(), new Set([nodeId]));
      setNodes(next.nodes);
      setEdges(next.edges);
      if (kind) {
        trackNodeBuilderBlockRemoved(kind, "header");
      }
    },
    [graph, kindOf, setNodes, setEdges],
  );

  const isValidConnection = useCallback(
    (connection: Connection | BuilderEdge) =>
      !readOnly && isValidWire(connection, nodesRef.current, edgesRef.current),
    [readOnly, nodesRef, edgesRef],
  );

  const trackWire = useCallback(
    (connection: Connection, triggeredFrom: "connect" | "reconnect") => {
      const from = kindOf(connection.source);
      const to = kindOf(connection.target);
      if (from && to) {
        trackNodeBuilderWireConnected(from, to, triggeredFrom);
      }
    },
    [kindOf],
  );

  const connect = useCallback(
    (connection: Connection) => {
      if (isValidConnection(connection)) {
        setEdges(connectWire(graph(), connection));
        trackWire(connection, "connect");
      }
    },
    [graph, isValidConnection, setEdges, trackWire],
  );

  const reconnect = useCallback(
    (oldEdge: BuilderEdge, connection: Connection) => {
      if (isValidConnection(connection)) {
        setEdges(reconnectWire(graph(), oldEdge, connection));
        trackWire(connection, "reconnect");
      }
    },
    [graph, isValidConnection, setEdges, trackWire],
  );

  // A wire dropped on a handle the rules refused is worth knowing about.
  const connectEnd = useCallback<OnConnectEnd>(
    (_event, state) => {
      const from = kindOf(state.fromNode?.id);
      const to = kindOf(state.toNode?.id);
      if (state.isValid === false && from && to) {
        trackNodeBuilderWireRejected(from, to);
      }
    },
    [kindOf],
  );

  // The result block is permanent; everything else can go.
  const beforeDelete = useCallback<OnBeforeDelete<BuilderNode, BuilderEdge>>(
    async ({ nodes, edges }) => {
      const removable = nodes.filter((node) => node.id !== RESULT_NODE_ID);
      removable.forEach((node) => {
        if (node.type) {
          trackNodeBuilderBlockRemoved(node.type, "keyboard");
        }
      });
      return { nodes: removable, edges };
    },
    [],
  );

  return useMemo(
    () => ({
      removeNode,
      isValidConnection,
      connect,
      reconnect,
      connectEnd,
      beforeDelete,
    }),
    [
      removeNode,
      isValidConnection,
      connect,
      reconnect,
      connectEnd,
      beforeDelete,
    ],
  );
}
