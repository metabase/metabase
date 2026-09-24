// Which wires may be drawn.

import type { Connection } from "@xyflow/react";

import type { BuilderEdge, BuilderNode } from "../types";

import {
  isExpressionNode,
  isFilterNode,
  isJoinNode,
  isResultNode,
  isTableNode,
  isUtilityNode,
  stageRank,
} from "./nodes";

export const CHAIN_INPUT_HANDLES = new Set(["lhs", "rhs", "in"]);

// Following input wires upstream from `source`, does it ever reach `target`?
export function createsLoop(
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

// Right inputs take a table; left inputs take a table or a join. Utility
// blocks take the chain in stage order and feed the result or a later block.
// Nothing may loop back on itself.
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
  if (isUtilityNode(targetNode)) {
    const sourceRank = stageRank(sourceNode);
    const targetRank = stageRank(targetNode);
    // Earlier steps feed later ones; only custom columns and filters chain
    // onto their own kind.
    const isOrdered =
      sourceRank < targetRank ||
      (sourceRank === targetRank &&
        (isFilterNode(targetNode) || isExpressionNode(targetNode)));
    return (
      targetHandle === "in" && isOrdered && !createsLoop(source, target, edges)
    );
  }
  if (!isJoinNode(targetNode) || stageRank(sourceNode) !== 0) {
    return false;
  }
  if (targetHandle === "rhs") {
    return isTableNode(sourceNode);
  }
  return targetHandle === "lhs" && !createsLoop(source, target, edges);
}
