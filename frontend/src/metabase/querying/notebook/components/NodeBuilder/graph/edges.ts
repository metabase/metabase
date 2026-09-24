// Wires: creation and styling.

import { type Connection, MarkerType } from "@xyflow/react";
import { t } from "ttag";

import type { BuilderEdge } from "../types";

import type { CompiledGraph } from "./compile";
import {
  EXPRESSION_COLOR,
  FILTER_COLOR,
  JOIN_COLOR,
  LIMIT_COLOR,
  SORT_COLOR,
  SOURCE_COLOR,
  SUMMARIZE_COLOR,
  TABLE_COLOR,
} from "./constants";

export function createEdge(connection: Connection): BuilderEdge {
  return {
    id: `${connection.source}:${connection.sourceHandle}->${connection.target}:${connection.targetHandle}`,
    type: "wire",
    source: connection.source,
    sourceHandle: connection.sourceHandle,
    target: connection.target,
    targetHandle: connection.targetHandle,
  };
}

// Ids carry their block kind as a prefix, which is all a colour needs.
export function nodeColorById(nodeId: string, sourceNodeId: string | null) {
  if (nodeId.startsWith("join-")) {
    return JOIN_COLOR;
  }
  if (nodeId.startsWith("expression-")) {
    return EXPRESSION_COLOR;
  }
  if (nodeId.startsWith("filter-")) {
    return FILTER_COLOR;
  }
  if (nodeId.startsWith("summarize-")) {
    return SUMMARIZE_COLOR;
  }
  if (nodeId.startsWith("sort-")) {
    return SORT_COLOR;
  }
  if (nodeId.startsWith("limit-")) {
    return LIMIT_COLOR;
  }
  return nodeId === sourceNodeId ? SOURCE_COLOR : TABLE_COLOR;
}

export function edgeColor(edge: BuilderEdge, sourceNodeId: string | null) {
  return nodeColorById(edge.source, sourceNodeId);
}

// Wires in the compiled query are solid and animated; the rest are dashed. A
// selected wire is only nudged heavier here; the halo is drawn by `WireEdge`.
export function decorateEdge(
  edge: BuilderEdge,
  compiled: CompiledGraph,
): BuilderEdge {
  const isActive = compiled.activeEdgeIds.has(edge.id);
  const isSelected = edge.selected === true;
  const color = edgeColor(edge, compiled.sourceNodeId);
  const sourceStage = compiled.stagesByNodeId.get(edge.source)?.stageIndex ?? 0;
  const targetStage =
    compiled.stagesByNodeId.get(edge.target)?.stageIndex ?? sourceStage;
  const stageLabel =
    isActive && targetStage > sourceStage
      ? t`Stage ${targetStage + 1}`
      : undefined;
  return {
    ...edge,
    type: "wire",
    data: { ...edge.data, stageLabel },
    animated: isActive,
    style: {
      stroke: color,
      strokeWidth: isSelected ? 3 : 2.5,
      strokeDasharray: isActive ? undefined : "6 4",
    },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
  };
}
