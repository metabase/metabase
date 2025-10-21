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
  NodeId,
  NodeLink,
  NodeLocation,
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

export function getNodeLink(node: DependencyNode): NodeLink | undefined {
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
      url: Urls.transform(node.id),
      tooltip: t`View this transform`,
    }))
    .with({ type: "snippet" }, () => undefined)
    .exhaustive();
}

export function getNodeLocationInfo(
  node: DependencyNode,
): NodeLocation | undefined {
  return match<DependencyNode, NodeLocation | undefined>(node)
    .with({ type: "card", data: { dashboard: P.nonNullable } }, (node) => ({
      icon: "dashboard",
      parts: [
        {
          label: node.data.dashboard.name,
          url: Urls.dashboard(node.data.dashboard),
        },
      ],
    }))
    .with({ type: "card", data: { collection: P.nonNullable } }, (node) => ({
      icon: "collection",
      parts: [
        {
          label: node.data.collection.name,
          url: Urls.collection(node.data.collection),
        },
      ],
    }))
    .with({ type: "table", data: { db: P.nonNullable } }, (node) => ({
      icon: "database",
      parts: [
        {
          label: node.data.db.name,
          url: Urls.dataModelDatabase(node.data.db_id),
        },
        {
          label: node.data.schema,
          url: Urls.dataModelSchema(node.data.db_id, node.data.schema),
        },
      ],
    }))
    .with(
      { type: "transform", data: { table: { db: P.nonNullable } } },
      (node) => ({
        icon: "database",
        parts: [
          {
            label: node.data.table.db.name,
            url: Urls.dataModelDatabase(node.data.table.db_id),
          },
          {
            label: node.data.table.schema,
            url: Urls.dataModelSchema(
              node.data.table.db_id,
              node.data.table.schema,
            ),
          },
        ],
      }),
    )
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
