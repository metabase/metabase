// Which wires may be drawn.

import type { Connection } from "@xyflow/react";

import type { BuilderEdge, BuilderNode } from "../types";

import {
  isExpressionNode,
  isFilterNode,
  isJoinNode,
  isResultNode,
  isSummarizeNode,
  isTableNode,
  isUtilityNode,
  stageRank,
  startsNextStage,
} from "./nodes";

const CHAIN_INPUT_HANDLES = new Set(["lhs", "rhs", "in"]);

// Following input wires upstream from `source`, does it ever reach `target`?
function createsLoop(
  source: string,
  target: string,
  edges: BuilderEdge[],
): boolean {
  const seen = new Set<string>();
  const pending = [source];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current == null) {
      break;
    }
    if (current === target) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    edges.forEach((edge) => {
      if (
        edge.target === current &&
        CHAIN_INPUT_HANDLES.has(edge.targetHandle ?? "")
      ) {
        pending.push(edge.source);
      }
    });
  }
  return false;
}

// Where a chain stands at a block: how far along the stage order its current
// stage has come, and whether that stage already summarizes.
type ChainState = { rank: number; hasSummarize: boolean };

const FRESH: ChainState = { rank: 0, hasSummarize: false };

// Walks the chain upstream from a block, the same way the compiler does, so a
// new wire can be judged by what feeds it rather than by the block alone.
function chainStateAt(
  nodeId: string,
  nodes: BuilderNode[],
  edges: BuilderEdge[],
  seen: Set<string> = new Set(),
): ChainState {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node || seen.has(nodeId)) {
    return FRESH;
  }
  seen.add(nodeId);
  const feeding = (handle: string) =>
    edges.find(
      (edge) => edge.target === nodeId && edge.targetHandle === handle,
    );
  if (isJoinNode(node)) {
    const lhs = feeding("lhs");
    const base = lhs ? chainStateAt(lhs.source, nodes, edges, seen) : FRESH;
    // A join after a summarize opens the next stage.
    return base.hasSummarize ? FRESH : base;
  }
  if (isUtilityNode(node)) {
    const input = feeding("in");
    const base = input ? chainStateAt(input.source, nodes, edges, seen) : FRESH;
    const rank = stageRank(node);
    if (startsNextStage(node) && base.hasSummarize) {
      return { rank, hasSummarize: isSummarizeNode(node) };
    }
    return {
      rank: Math.max(base.rank, rank),
      hasSummarize: base.hasSummarize || isSummarizeNode(node),
    };
  }
  return FRESH;
}

// Right inputs take a table; left inputs take a table, a join, or anything
// once its stage summarizes. Utility blocks take the chain in stage order:
// custom columns, filters, summarize, sort, limit, with the order starting
// over after a summarize. Nothing may loop back on itself.
export function isValidConnection(
  connection: Connection | BuilderEdge,
  nodes: BuilderNode[],
  edges: BuilderEdge[],
): boolean {
  const { source, target, sourceHandle, targetHandle } = connection;
  if (!source || !target || source === target || sourceHandle !== "out") {
    return false;
  }
  const sourceNode = nodes.find((node) => node.id === source);
  const targetNode = nodes.find((node) => node.id === target);
  if (!sourceNode || !targetNode || isResultNode(sourceNode)) {
    return false;
  }
  if (isTableNode(sourceNode) && sourceNode.data.table == null) {
    return false;
  }
  if (isResultNode(targetNode)) {
    return targetHandle === "in";
  }
  if (createsLoop(source, target, edges)) {
    return false;
  }
  const state = chainStateAt(source, nodes, edges);
  if (isUtilityNode(targetNode)) {
    if (targetHandle !== "in") {
      return false;
    }
    if (state.hasSummarize && startsNextStage(targetNode)) {
      return true;
    }
    const targetRank = stageRank(targetNode);
    return (
      state.rank < targetRank ||
      (state.rank === targetRank &&
        (isFilterNode(targetNode) || isExpressionNode(targetNode)))
    );
  }
  if (!isJoinNode(targetNode)) {
    return false;
  }
  if (targetHandle === "rhs") {
    return isTableNode(sourceNode);
  }
  // Joins come first on a stage: a fresh chain, or one whose stage summarizes.
  return targetHandle === "lhs" && (state.rank === 0 || state.hasSummarize);
}
