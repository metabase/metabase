// Edits to the wired graph as pure functions. The container applies what
// they return and never reasons about wires itself.

import { type Connection, type XYPosition, reconnectEdge } from "@xyflow/react";

import type { BuilderEdge, BuilderNode } from "../types";

import { RESULT_NODE_ID } from "./constants";
import { createEdge } from "./edges";

export type Graph = { nodes: BuilderNode[]; edges: BuilderEdge[] };

// Removes blocks and the wires touching them. The result block never goes.
export function removeNodes(graph: Graph, ids: ReadonlySet<string>): Graph {
  const removed = new Set([...ids].filter((id) => id !== RESULT_NODE_ID));
  return {
    nodes: graph.nodes.filter((node) => !removed.has(node.id)),
    edges: graph.edges.filter(
      (edge) => !removed.has(edge.source) && !removed.has(edge.target),
    ),
  };
}

// One wire per input: a new one replaces whatever was plugged in before.
export function connectWire(
  graph: Graph,
  connection: Connection,
): BuilderEdge[] {
  return [...withoutInput(graph.edges, connection), createEdge(connection)];
}

// Dragging either end of an existing wire onto another handle.
export function reconnectWire(
  graph: Graph,
  oldEdge: BuilderEdge,
  connection: Connection,
): BuilderEdge[] {
  const others = withoutInput(
    graph.edges.filter((edge) => edge.id !== oldEdge.id),
    connection,
  );
  return reconnectEdge(oldEdge, connection, [oldEdge, ...others]);
}

function withoutInput(edges: BuilderEdge[], connection: Connection) {
  return edges.filter(
    (edge) =>
      !(
        edge.target === connection.target &&
        edge.targetHandle === connection.targetHandle
      ),
  );
}

// Once react-flow has measured a dropped block, puts its centre exactly
// under where the cursor was. Null when none of the pending blocks is
// measured yet.
export function recenterDropped(
  nodes: BuilderNode[],
  pending: Map<string, XYPosition>,
): BuilderNode[] | null {
  const ready = nodes.filter(
    (node) =>
      pending.has(node.id) && node.measured?.width && node.measured?.height,
  );
  if (ready.length === 0) {
    return null;
  }
  return nodes.map((node) => {
    const cursor = pending.get(node.id);
    const width = node.measured?.width;
    const height = node.measured?.height;
    if (!cursor || !width || !height) {
      return node;
    }
    pending.delete(node.id);
    return {
      ...node,
      position: { x: cursor.x - width / 2, y: cursor.y - height / 2 },
    };
  });
}
