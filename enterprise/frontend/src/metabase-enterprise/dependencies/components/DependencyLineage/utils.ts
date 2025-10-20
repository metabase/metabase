import type { Edge } from "@xyflow/react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type {
  CardType,
  DependencyEdge,
  DependencyGraph,
  DependencyGroupType,
  DependencyId,
  DependencyNode,
  DependencyType,
  VisualizationDisplay,
} from "metabase-types/api";

import type {
  EdgeId,
  GraphData,
  LinkWithLabelInfo,
  LinkWithTooltipInfo,
  NodeId,
  NodeType,
} from "./types";

export function getNodeId(id: DependencyId, type: DependencyType): NodeId {
  return `${id}-${type}`;
}

export function getEdgeId(sourceId: NodeId, targetId: NodeId): EdgeId {
  return `${sourceId}-${targetId}`;
}

function getNodes(nodes: DependencyNode[]): NodeType[] {
  return nodes.map((node) => {
    const nodeId = getNodeId(node.id, node.type);

    return {
      id: nodeId,
      type: "node",
      data: node,
      position: { x: 0, y: 0 },
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
      selectable: false,
      deletable: false,
    };
  });
}

export function getInitialGraph({ nodes, edges }: DependencyGraph): GraphData {
  return {
    nodes: getNodes(nodes),
    edges: getEdges(edges),
  };
}

export function isSameNode(
  node: DependencyNode,
  id: DependencyId,
  type: DependencyType,
) {
  return node.id === id && node.type === type;
}

export function findNode(
  nodes: NodeType[],
  id: DependencyId,
  type: DependencyType,
) {
  return nodes.find((node) => isSameNode(node.data, id, type));
}

export function getNodeLabel(node: DependencyNode) {
  return node.type === "table" ? node.data.display_name : node.data.name;
}

export function getNodeDescription(node: DependencyNode) {
  return node.data.description;
}

export function getNodeIcon(node: DependencyNode): IconName {
  return getNodeIconWithType(
    node.type,
    node.type === "card" ? node.data.type : undefined,
    node.type === "card" ? node.data.display : undefined,
  );
}

type NodeIconData = {
  type: DependencyType;
  cardType?: CardType;
  cardDisplay?: VisualizationDisplay;
};

export function getNodeIconWithType(
  type: DependencyType,
  cardType?: CardType,
  cardDisplay?: VisualizationDisplay,
): IconName {
  return match<NodeIconData, IconName>({ type, cardType, cardDisplay })
    .with(
      { type: "card", cardType: "question", cardDisplay: P.nonNullable },
      ({ cardDisplay }) =>
        visualizations.get(cardDisplay)?.iconName ?? "table2",
    )
    .with({ type: "card", cardType: "model" }, () => "model")
    .with({ type: "card", cardType: "metric" }, () => "metric")
    .with({ type: "card" }, () => "table2")
    .with({ type: "table" }, () => "table")
    .with({ type: "transform" }, () => "refresh_downstream")
    .with({ type: "snippet" }, () => "sql")
    .exhaustive();
}

export function getNodeLink(
  node: DependencyNode,
): LinkWithTooltipInfo | undefined {
  return match(node)
    .with({ type: "card" }, (node) => ({
      url: Urls.question({
        id: node.id,
        name: node.data.name,
        type: node.data.type,
      }),
      tooltip: match(node.data.type)
        .with("question", () => t`View this question`)
        .with("model", () => t`View this model`)
        .with("metric", () => t`View this metric`)
        .exhaustive(),
    }))
    .with({ type: "table" }, (node) => ({
      url: Urls.dataModelTable(node.data.db_id, node.data.schema, node.id),
      tooltip: t`View metadata`,
    }))
    .with({ type: "transform" }, (node) => ({
      url: `/admin/transforms/${node.id}`,
      tooltip: t`View this transform`,
    }))
    .with({ type: "snippet" }, () => undefined)
    .exhaustive();
}

export function getNodeLocationInfo(
  node: DependencyNode,
): LinkWithLabelInfo | undefined {
  return match<DependencyNode, LinkWithLabelInfo | undefined>(node)
    .with({ type: "card", data: { dashboard: P.nonNullable } }, (node) => ({
      label: node.data.dashboard.name,
      icon: "dashboard",
      url: Urls.dashboard(node.data.dashboard),
    }))
    .with({ type: "card", data: { collection: P.nonNullable } }, (node) => ({
      label: node.data.collection.name,
      icon: "folder",
      url: Urls.collection(node.data.collection),
    }))
    .with(
      { type: P.union("card", "table", "transform", "snippet") },
      () => undefined,
    )
    .exhaustive();
}

export function getNodeViewCount(node: DependencyNode): number | undefined {
  return match(node)
    .with({ type: "card" }, (node) => node.data.view_count)
    .with({ type: P.union("table", "transform", "snippet") }, () => undefined)
    .exhaustive();
}

export function getCardType(
  groupType: DependencyGroupType,
): CardType | undefined {
  switch (groupType) {
    case "question":
    case "model":
    case "metric":
      return groupType;
    default:
      return undefined;
  }
}

export function isCardType(groupType: DependencyGroupType) {
  return getCardType(groupType) != null;
}

export function getDependencyType(
  groupType: DependencyGroupType,
): DependencyType {
  switch (groupType) {
    case "question":
    case "model":
    case "metric":
      return "card";
    default:
      return groupType;
  }
}
