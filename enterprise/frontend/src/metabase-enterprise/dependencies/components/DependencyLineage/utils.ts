import dagre from "@dagrejs/dagre";
import type { Edge } from "@xyflow/react";
import { match } from "ts-pattern";

import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type {
  DependencyEdge,
  DependencyEntry,
  DependencyGraph,
  DependencyId,
  DependencyNode,
  DependencyType,
} from "metabase-types/api";

import S from "./DependencyLineage.module.css";
import type { EdgeId, GraphData, NodeId, NodeType } from "./types";

export function getNodeId(id: DependencyId, type: DependencyType): NodeId {
  return `${type}-${id}`;
}

export function getEdgeId(sourceId: NodeId, targetId: NodeId): EdgeId {
  return `${sourceId}-${targetId}`;
}

function getNodes(nodes: DependencyNode[], entry: DependencyEntry): NodeType[] {
  return nodes.map((node) => {
    const nodeId = getNodeId(node.id, node.type);

    return {
      id: nodeId,
      className: S.node,
      type: "node",
      data: node,
      position: { x: 0, y: 0 },
      selected: node.id === entry.id && node.type === entry.type,
      draggable: false,
      deletable: false,
    };
  });
}

function getEdges(edges: DependencyEdge[]): Edge[] {
  return edges.map((edge) => {
    const sourceId = getNodeId(edge.from_entity_id, edge.from_entity_type);
    const targetId = getNodeId(edge.to_entity_id, edge.to_entity_type);

    return {
      id: getEdgeId(sourceId, targetId),
      data: edge,
      source: sourceId,
      target: targetId,
      focusable: false,
      selectable: false,
      deletable: false,
    };
  });
}

export function getInitialGraph(
  { nodes, edges }: DependencyGraph,
  entry: DependencyEntry,
): GraphData {
  return {
    nodes: getNodes(nodes, entry),
    edges: getEdges(edges),
  };
}

export function getNodesWithPositions(
  nodes: NodeType[],
  edges: Edge[],
): NodeType[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({ rankdir: "LR" });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: node.measured?.width,
      height: node.measured?.height,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.target, edge.source);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const { x, y, width, height } = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: x - width / 2,
        y: y - height / 2,
      },
    };
  });
}

export function getNodeLabel(node: DependencyNode) {
  return node.type === "table" ? node.data.display_name : node.data.name;
}

export function getNodeIcon(node: DependencyNode): IconName {
  return match<DependencyNode, IconName>(node)
    .with(
      { type: "card", data: { type: "question" } },
      (node) => visualizations.get(node.data.display)?.iconName ?? "table2",
    )
    .with({ type: "card", data: { type: "model" } }, () => "model")
    .with({ type: "card", data: { type: "metric" } }, () => "metric")
    .with({ type: "table" }, () => "table")
    .with({ type: "transform" }, () => "refresh_downstream")
    .with({ type: "snippet" }, () => "sql")
    .exhaustive();
}

export function getNodeLink(node: DependencyNode): string | undefined {
  return match(node)
    .with({ type: "card" }, (node) =>
      Urls.question({
        id: node.id,
        name: node.data.name,
        type: node.data.type,
      }),
    )
    .with(
      { type: "table" },
      (node) =>
        `/admin/datamodel/database/${node.data.db_id}/schema/${node.data.db_id}:${encodeURIComponent(node.data.schema ?? "")}/table/${node.id}`,
    )
    .with({ type: "transform" }, (node) => `/admin/transforms/${node.id}`)
    .with({ type: "snippet" }, () => undefined)
    .exhaustive();
}

export function getNodeLocationLabel(node: DependencyNode): string | undefined {
  if (node.type === "card") {
    if (node.data.dashboard != null) {
      return node.data.dashboard.name;
    }

    if (node.data.collection != null) {
      return node.data.collection.name;
    }
  }
}

export function getNodeViewCount(node: DependencyNode): number | undefined {
  if (node.type === "card") {
    return node.data.view_count;
  }
}
