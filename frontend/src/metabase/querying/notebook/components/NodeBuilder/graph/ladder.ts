// The ladder: the locked run of tail blocks between the chain and the result, split into stages.

import type {
  BuilderEdge,
  BuilderNode,
  ExpressionFlowNode,
  FilterFlowNode,
  JoinFlowNode,
  LimitFlowNode,
  SortFlowNode,
  SummarizeFlowNode,
} from "../types";

import { RESULT_NODE_ID } from "./constants";
import { createEdge } from "./edges";
import {
  isExpressionNode,
  isFilterNode,
  isJoinNode,
  isLimitNode,
  isSortNode,
  isSummarizeNode,
  stageRank,
} from "./nodes";

// Summarize, sort and limit close the chain in this order, one of each; their wires are locked and the user only ever deletes them.
export const TAIL_KINDS = ["summarize", "sort", "limit"] as const;

export type TailKind = (typeof TAIL_KINDS)[number];

export type LadderKind = TailKind | "filter" | "expression" | "join";

export function isTailNode(
  node: BuilderNode,
): node is
  | SummarizeFlowNode
  | SortFlowNode
  | LimitFlowNode
  | FilterFlowNode
  | ExpressionFlowNode
  | JoinFlowNode {
  return (
    isSummarizeNode(node) ||
    isSortNode(node) ||
    isLimitNode(node) ||
    ((isFilterNode(node) || isExpressionNode(node) || isJoinNode(node)) &&
      node.data.afterSummarize === true)
  );
}

// Blocks that work on a summarize's results, and so start the next stage.
export function startsNextStage(node: BuilderNode): boolean {
  return (
    isJoinNode(node) ||
    isExpressionNode(node) ||
    isFilterNode(node) ||
    isSummarizeNode(node)
  );
}

export function lockTailWires(
  edges: BuilderEdge[],
  nodes: BuilderNode[],
): BuilderEdge[] {
  const tailIds = new Set(nodes.filter(isTailNode).map((node) => node.id));
  return edges.map((edge) =>
    tailIds.has(edge.source) || tailIds.has(edge.target)
      ? { ...edge, deletable: false, reconnectable: false }
      : edge,
  );
}

// Wires that join the neighbours of the removed tail blocks once they are gone.
export function bridgeAroundTailNodes(
  edges: BuilderEdge[],
  removedIds: ReadonlySet<string>,
): BuilderEdge[] {
  const bridges: BuilderEdge[] = [];
  for (const nodeId of removedIds) {
    const inbound = edges.find(
      (edge) => edge.target === nodeId && edge.targetHandle !== "rhs",
    );
    if (!inbound || removedIds.has(inbound.source)) {
      continue;
    }
    let outbound = edges.find((edge) => edge.source === nodeId);
    while (outbound && removedIds.has(outbound.target)) {
      const nextId = outbound.target;
      outbound = edges.find((edge) => edge.source === nextId);
    }
    if (!outbound) {
      continue;
    }
    bridges.push(
      createEdge({
        source: inbound.source,
        sourceHandle: inbound.sourceHandle ?? null,
        target: outbound.target,
        targetHandle: outbound.targetHandle ?? null,
      }),
    );
  }
  return bridges;
}

// Walks back from the result through the tail blocks to the one a new wire should land on.
export function tailHeadId(nodes: BuilderNode[], edges: BuilderEdge[]): string {
  const tailIds = new Set(nodes.filter(isTailNode).map((node) => node.id));
  let head = RESULT_NODE_ID;
  for (;;) {
    const inbound = edges.find((edge) => edge.target === head);
    if (!inbound || !tailIds.has(inbound.source)) {
      return head;
    }
    head = inbound.source;
  }
}

// The tail blocks in wire order, from the first of them to the last one
// before the result.
export function tailLadder(
  nodes: BuilderNode[],
  edges: BuilderEdge[],
): BuilderNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ladder: BuilderNode[] = [];
  let cursor = tailHeadId(nodes, edges);
  while (cursor !== RESULT_NODE_ID) {
    const node = byId.get(cursor);
    if (!node || !isTailNode(node) || ladder.includes(node)) {
      break;
    }
    ladder.push(node);
    const outbound = edges.find((edge) => edge.source === cursor);
    if (!outbound) {
      break;
    }
    cursor = outbound.target;
  }
  return ladder;
}

// Splits the ladder into the query's stages: a filter or a summarize that
// comes after a summarize works on its results, so it starts the next stage.
export function ladderStages(ladder: BuilderNode[]): BuilderNode[][] {
  const stages: BuilderNode[][] = [];
  let current: BuilderNode[] = [];
  let hasSummarize = false;
  ladder.forEach((node) => {
    if (startsNextStage(node) && hasSummarize) {
      stages.push(current);
      current = [];
      hasSummarize = false;
    }
    current.push(node);
    if (isSummarizeNode(node)) {
      hasSummarize = true;
    }
  });
  if (current.length > 0) {
    stages.push(current);
  }
  return stages;
}

export const LADDER_RANK: Record<LadderKind, number> = {
  join: 0,
  expression: 1,
  filter: 2,
  summarize: 3,
  sort: 4,
  limit: 5,
};

// The block a new tail block of `kind` slots in before when it joins the
// given stage, or the result when it goes last.
export function ladderSuccessorId(
  stages: BuilderNode[][],
  stageIndex: number,
  kind: LadderKind,
): string {
  const rank = LADDER_RANK[kind];
  for (let index = stageIndex; index < stages.length; index++) {
    for (const node of stages[index]) {
      if (index > stageIndex || stageRank(node) > rank) {
        return node.id;
      }
    }
  }
  return RESULT_NODE_ID;
}

// Removing a summarize takes every later stage with it: those blocks were
// filtering and summarizing its results.
export function withDependentTail(
  nodes: BuilderNode[],
  edges: BuilderEdge[],
  removedIds: ReadonlySet<string>,
): Set<string> {
  const all = new Set(removedIds);
  const stages = ladderStages(tailLadder(nodes, edges));
  stages.forEach((stage, index) => {
    const losesSummarize = stage.some(
      (node) => isSummarizeNode(node) && removedIds.has(node.id),
    );
    if (losesSummarize) {
      stages
        .slice(index + 1)
        .forEach((later) => later.forEach((node) => all.add(node.id)));
    }
  });
  // A ladder join that goes takes the table wired into its right input along.
  nodes.forEach((node) => {
    if (all.has(node.id) && isJoinNode(node) && node.data.afterSummarize) {
      const rhs = edges.find(
        (edge) => edge.target === node.id && edge.targetHandle === "rhs",
      );
      if (rhs) {
        all.add(rhs.source);
      }
    }
  });
  return all;
}
