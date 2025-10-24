import type { Edge } from "@xyflow/react";
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
  NodeType,
  NodeTypeInfo,
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
): boolean {
  return node.id === id && node.type === type;
}

export function findNode(
  nodes: NodeType[],
  id: DependencyId,
  type: DependencyType,
): NodeType | null {
  return nodes.find((node) => isSameNode(node.data, id, type)) ?? null;
}

export function getNodeLabel(node: DependencyNode): string {
  switch (node.type) {
    case "table":
      return node.data.display_name;
    case "sandbox":
      return t`Row and column security rule`;
    default:
      return node.data.name;
  }
}

export function getNodeDescription(node: DependencyNode): string | null {
  switch (node.type) {
    case "document":
    case "sandbox":
      return null;
    default:
      return node.data.description ?? "";
  }
}

export function getNodeIcon(node: DependencyNode): IconName {
  return getNodeIconWithType(
    node.type,
    node.type === "card" ? node.data.type : undefined,
    node.type === "card" ? node.data.display : undefined,
  );
}

export function getNodeIconWithType(
  type: DependencyType,
  cardType?: CardType,
  cardDisplay?: VisualizationDisplay,
): IconName {
  switch (type) {
    case "card":
      switch (cardType) {
        case "question":
          return cardDisplay != null
            ? (visualizations.get(cardDisplay)?.iconName ?? "table2")
            : "table2";
        case "model":
          return "model";
        case "metric":
          return "metric";
        default:
          return "table2";
      }
    case "table":
      return "table";
    case "transform":
      return "refresh_downstream";
    case "snippet":
      return "sql";
    case "dashboard":
      return "dashboard";
    case "document":
      return "document";
    case "sandbox":
      return "permissions_limited";
  }
}

function getCardLinkLabel(cardType: CardType): string {
  switch (cardType) {
    case "question":
      return t`View this question`;
    case "model":
      return t`View this model`;
    case "metric":
      return t`View this metric`;
  }
}

export function getNodeLink(node: DependencyNode): NodeLink | null {
  switch (node.type) {
    case "card":
      return {
        label: getCardLinkLabel(node.data.type),
        url: Urls.question({
          id: node.id,
          name: node.data.name,
          type: node.data.type,
        }),
      };
    case "table":
      return {
        label: t`View metadata`,
        url: Urls.dataModelTable(node.data.db_id, node.data.schema, node.id),
      };
    case "transform":
      return {
        label: t`View this transform`,
        url: Urls.transform(node.id),
      };
    case "dashboard":
      return {
        label: `View this dashboard`,
        url: Urls.dashboard({ id: node.id, name: node.data.name }),
      };
    case "document":
      return {
        label: `View this document`,
        url: Urls.document({ id: node.id }),
      };
    case "sandbox":
      if (node.data.table != null) {
        return {
          label: `View this permission`,
          url: Urls.tableDataPermissions(
            node.data.table.db_id,
            node.data.table.schema,
            node.data.table.id,
          ),
        };
      }
      return null;
    case "snippet":
      return null;
  }
}

export function getNodeLocationInfo(node: DependencyNode): NodeLink[] | null {
  switch (node.type) {
    case "card":
      if (node.data.dashboard != null) {
        return [
          {
            label: node.data.dashboard.name,
            url: Urls.dashboard(node.data.dashboard),
          },
        ];
      }
      if (node.data.collection != null) {
        return [
          {
            label: node.data.collection.name,
            url: Urls.collection(node.data.collection),
          },
        ];
      }
      return null;
    case "table":
      if (node.data.db != null) {
        return [
          {
            label: node.data.db.name,
            url: Urls.dataModelDatabase(node.data.db_id),
          },
          {
            label: node.data.schema,
            url: Urls.dataModelSchema(node.data.db_id, node.data.schema),
          },
        ];
      }
      return null;
    case "dashboard":
    case "document":
      if (node.data.collection != null) {
        return [
          {
            label: node.data.collection.name,
            url: Urls.collection(node.data.collection),
          },
        ];
      }
      return null;
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function getNodeViewCount(node: DependencyNode): number | null {
  switch (node.type) {
    case "card":
      // view_count is not calculated property for models and metrics since
      // they are typically not run directly
      return node.data.type === "question"
        ? (node.data.view_count ?? null)
        : null;
    case "dashboard":
    case "document":
      return node.data.view_count ?? null;
    case "table":
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function getCardType(groupType: DependencyGroupType): CardType | null {
  switch (groupType) {
    case "question":
    case "model":
    case "metric":
      return groupType;
    default:
      return null;
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

export function getNodeTypeInfo(node: DependencyNode): NodeTypeInfo {
  switch (node.type) {
    case "card":
      switch (node.data.type) {
        case "question":
          return { label: t`Question`, color: "text-secondary" };
        case "model":
          return { label: t`Model`, color: "brand" };
        case "metric":
          return { label: t`Metric`, color: "summarize" };
      }
      break;
    case "table":
      return { label: t`Table`, color: "brand" };
    case "transform":
      return { label: t`Transform`, color: "warning" };
    case "snippet":
      return { label: t`Snippet`, color: "text-secondary" };
    case "dashboard":
      return { label: t`Dashboard`, color: "filter" };
    case "document":
      return { label: t`Document`, color: "text-secondary" };
    case "sandbox":
      return { label: t`Permission`, color: "error" };
  }
}
