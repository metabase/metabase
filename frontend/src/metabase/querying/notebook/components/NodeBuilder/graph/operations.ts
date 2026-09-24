// Edits to the wired graph as pure functions. The container applies what
// they return and never reasons about wires itself.

import { type Connection, type XYPosition, reconnectEdge } from "@xyflow/react";

import type { BuilderEdge, BuilderNode } from "../types";

import { isValidConnection } from "./connections";
import { RESULT_NODE_ID } from "./constants";
import { createEdge } from "./edges";
import {
  type LadderKind,
  bridgeAroundTailNodes,
  isTailNode,
  ladderStages,
  ladderSuccessorId,
  lockTailWires,
  tailHeadId,
  tailLadder,
  withDependentTail,
} from "./ladder";
import {
  createExpressionNode,
  createFilterNode,
  createJoinNode,
  createLimitNode,
  createSortNode,
  createSummarizeNode,
  createTableNode,
} from "./nodes";

export type Graph = { nodes: BuilderNode[]; edges: BuilderEdge[] };

// Room for a tail block when it slots into the chain.
const TAIL_SHIFT = 400;

// Removes blocks and whatever depended on them; the ladder is bridged around
// the gap. The result block never goes.
export function removeNodes(graph: Graph, ids: ReadonlySet<string>): Graph {
  const wanted = new Set([...ids].filter((id) => id !== RESULT_NODE_ID));
  if (wanted.size === 0) {
    return graph;
  }
  const removedIds = withDependentTail(graph.nodes, graph.edges, wanted);
  const touchesTail = graph.nodes.some(
    (node) => removedIds.has(node.id) && isTailNode(node),
  );
  const bridges = touchesTail
    ? bridgeAroundTailNodes(graph.edges, removedIds)
    : [];
  return {
    nodes: graph.nodes.filter((node) => !removedIds.has(node.id)),
    edges: [
      ...graph.edges.filter(
        (edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target),
      ),
      ...bridges,
    ],
  };
}

export type Deletion = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  // Wires to add once the deletion has gone through.
  bridges: BuilderEdge[];
};

// What a delete-key press should take out: the picked blocks, their
// dependants, and the locked wires of any tail block among them.
export function planDeletion(
  graph: Graph,
  toDelete: BuilderNode[],
  edgesToDelete: BuilderEdge[],
): Deletion {
  const removedIds = withDependentTail(
    graph.nodes,
    graph.edges,
    new Set(
      toDelete
        .filter((node) => node.id !== RESULT_NODE_ID)
        .map((node) => node.id),
    ),
  );
  const nodes = graph.nodes.filter((node) => removedIds.has(node.id));
  const tail = nodes.filter(isTailNode);
  if (tail.length === 0) {
    return { nodes, edges: edgesToDelete, bridges: [] };
  }
  const tailIds = new Set(tail.map((node) => node.id));
  const bridges = bridgeAroundTailNodes(graph.edges, tailIds).filter(
    (bridge) =>
      !removedIds.has(bridge.source) && !removedIds.has(bridge.target),
  );
  const doomed = new Set(edgesToDelete.map((edge) => edge.id));
  const tailWires = graph.edges.filter(
    (edge) =>
      (tailIds.has(edge.source) || tailIds.has(edge.target)) &&
      !doomed.has(edge.id),
  );
  return { nodes, edges: [...edgesToDelete, ...tailWires], bridges };
}

// Tail blocks stay at the end: a wire aimed at the result lands on the first
// of them instead.
export function redirectToTailHead(
  connection: Connection,
  graph: Graph,
): Connection {
  if (connection.target !== RESULT_NODE_ID) {
    return connection;
  }
  const head = tailHeadId(graph.nodes, graph.edges);
  return head === RESULT_NODE_ID || head === connection.source
    ? connection
    : { ...connection, target: head, targetHandle: "in" };
}

// The wiring rules plus the ladder's own: only its first block, or the right
// input of a join in it, takes a wire from outside.
export function canConnect(
  connection: Connection | BuilderEdge,
  graph: Graph,
): boolean {
  if (!isValidConnection(connection, graph.nodes, graph.edges)) {
    return false;
  }
  const target = graph.nodes.find((node) => node.id === connection.target);
  return (
    !target ||
    !isTailNode(target) ||
    connection.targetHandle === "rhs" ||
    target.id === tailHeadId(graph.nodes, graph.edges)
  );
}

// One wire per input: a new one replaces whatever was plugged in before.
export function connectWire(
  graph: Graph,
  connection: Connection,
): BuilderEdge[] {
  return lockTailWires(
    [...withoutInput(graph.edges, connection), createEdge(connection)],
    graph.nodes,
  );
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
  return lockTailWires(
    reconnectEdge(oldEdge, connection, [oldEdge, ...others]),
    graph.nodes,
  );
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

// A tail block slots into a stage of the ladder, before the next kind there
// (or the result), and takes over whatever fed that block. With a summarize
// given, it goes on the stage after it, which is where its results live.
// Null when there is nothing to add.
export function insertTailBlock(
  graph: Graph,
  kind: LadderKind,
  afterSummarizeId?: string,
): Graph | null {
  const { nodes, edges } = graph;
  const stages = ladderStages(tailLadder(nodes, edges));
  let stageIndex = Math.max(0, stages.length - 1);
  if (afterSummarizeId != null) {
    const at = stages.findIndex((stage) =>
      stage.some((node) => node.id === afterSummarizeId),
    );
    if (at < 0) {
      return null;
    }
    stageIndex = at + 1;
  }
  const target = stages[stageIndex] ?? [];
  if (target.some((node) => node.type === kind)) {
    return null;
  }
  const successorId = ladderSuccessorId(stages, stageIndex, kind);
  const successor = nodes.find((node) => node.id === successorId);
  if (!successor) {
    return null;
  }
  const inbound = edges.find(
    (edge) => edge.target === successor.id && edge.targetHandle === "in",
  );
  const position = { ...successor.position };
  const block = createTailBlock(kind, position);
  // A ladder join brings a blank table for its right input, placed above it.
  const extraNodes: BuilderNode[] = [];
  const wires: BuilderEdge[] = [];
  if (kind === "join") {
    const table = createTableNode(
      { x: position.x, y: position.y - TAIL_SHIFT / 2 },
      null,
    );
    extraNodes.push(table);
    wires.push(
      createEdge({
        source: table.id,
        sourceHandle: "out",
        target: block.id,
        targetHandle: "rhs",
      }),
    );
  }
  if (inbound) {
    wires.push(
      createEdge({
        source: inbound.source,
        sourceHandle: inbound.sourceHandle ?? null,
        target: block.id,
        targetHandle: kind === "join" ? "lhs" : "in",
      }),
    );
  }
  wires.push(
    createEdge({
      source: block.id,
      sourceHandle: "out",
      target: successor.id,
      targetHandle: "in",
    }),
  );
  // Everything from the successor onwards moves right to make room.
  const shifted = new Set<string>([successor.id]);
  let cursor: string | undefined = successor.id;
  while (cursor) {
    const next = edges.find((edge) => edge.source === cursor);
    cursor = next?.target;
    if (cursor) {
      shifted.add(cursor);
    }
  }
  return {
    nodes: [
      ...nodes.map((node) =>
        shifted.has(node.id)
          ? {
              ...node,
              position: { x: node.position.x + TAIL_SHIFT, y: node.position.y },
            }
          : node,
      ),
      block,
      ...extraNodes,
    ],
    edges: [
      ...edges.filter((edge) => edge.id !== inbound?.id),
      ...wires.map((edge) => ({
        ...edge,
        deletable: false,
        reconnectable: false,
      })),
    ],
  };
}

function createTailBlock(kind: LadderKind, position: XYPosition): BuilderNode {
  switch (kind) {
    case "summarize":
      return createSummarizeNode(position);
    case "sort":
      return createSortNode(position);
    case "limit":
      return createLimitNode(position);
    case "filter":
      return createFilterNode(position, [], true);
    case "expression":
      return createExpressionNode(position, [], true);
    case "join":
      return createJoinNode(position, null, null, null, true);
  }
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
