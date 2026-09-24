import type { Connection, OnBeforeDelete } from "@xyflow/react";
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useMemo,
} from "react";

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

  const removeNode = useCallback(
    (nodeId: string) => {
      const next = removeNodes(graph(), new Set([nodeId]));
      setNodes(next.nodes);
      setEdges(next.edges);
    },
    [graph, setNodes, setEdges],
  );

  const isValidConnection = useCallback(
    (connection: Connection | BuilderEdge) =>
      !readOnly && isValidWire(connection, nodesRef.current, edgesRef.current),
    [readOnly, nodesRef, edgesRef],
  );

  const connect = useCallback(
    (connection: Connection) => {
      if (isValidConnection(connection)) {
        setEdges(connectWire(graph(), connection));
      }
    },
    [graph, isValidConnection, setEdges],
  );

  const reconnect = useCallback(
    (oldEdge: BuilderEdge, connection: Connection) => {
      if (isValidConnection(connection)) {
        setEdges(reconnectWire(graph(), oldEdge, connection));
      }
    },
    [graph, isValidConnection, setEdges],
  );

  // The result block is permanent; everything else can go.
  const beforeDelete = useCallback<OnBeforeDelete<BuilderNode, BuilderEdge>>(
    async ({ nodes, edges }) => ({
      nodes: nodes.filter((node) => node.id !== RESULT_NODE_ID),
      edges,
    }),
    [],
  );

  return useMemo(
    () => ({ removeNode, isValidConnection, connect, reconnect, beforeDelete }),
    [removeNode, isValidConnection, connect, reconnect, beforeDelete],
  );
}
