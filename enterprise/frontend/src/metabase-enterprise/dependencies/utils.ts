import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type {
  CardType,
  DependencyGroupType,
  DependencyId,
  DependencyNode,
  DependencyType,
  LastEditInfo,
  VisualizationDisplay,
} from "metabase-types/api";

import type { NodeId, NodeLink, NodeTypeInfo } from "./types";

export function getNodeId(id: DependencyId, type: DependencyType): NodeId {
  return `${id}-${type}`;
}

export function getNodeLabel(node: DependencyNode): string {
  switch (node.type) {
    case "table":
      return node.data.display_name;
    case "sandbox":
      return node.data.table?.display_name ?? t`Row and column security rule`;
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
      return "transform";
    case "snippet":
      return "sql";
    case "dashboard":
      return "dashboard";
    case "document":
      return "document";
    case "sandbox":
      return "permissions_limited";
    case "segment":
      return "segment";
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
        url: Urls.dataModel({
          databaseId: node.data.db_id,
          schemaName: node.data.schema,
          tableId: node.id,
        }),
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
    case "segment":
      return {
        label: t`View this segment`,
        url: Urls.dataStudioSegment(node.id),
      };
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
            url: Urls.dataModel({ databaseId: node.data.db_id }),
          },
          {
            label: node.data.schema,
            url: Urls.dataModel({
              databaseId: node.data.db_id,
              schemaName: node.data.schema,
            }),
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
    case "segment":
      if (node.data.table != null) {
        return [
          {
            label: node.data.table.display_name,
            url: Urls.dataModel({
              databaseId: node.data.table.db_id,
              schemaName: node.data.table.schema,
              tableId: node.data.table.id,
            }),
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

export function getNodeLastEditInfo(node: DependencyNode): LastEditInfo | null {
  switch (node.type) {
    case "card":
      return node.data["last-edit-info"] ?? null;
    case "table":
    case "dashboard":
    case "document":
    case "segment":
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
    case "segment":
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
      return { label: t`Row and column security rule`, color: "error" };
    case "segment":
      return { label: t`Segment`, color: "accent2" };
  }
}

export function parseString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}

export function parseNumber(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return parseInt(value, 10);
}

export function parseEnum<T extends string>(
  value: unknown,
  items: readonly T[],
): T | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const item = items.find((item) => item === value);
  return item != null ? item : undefined;
}

export function parseList<T>(
  value: unknown,
  parseItem: (value: unknown) => T | undefined,
): T[] | undefined {
  if (value == null) {
    return undefined;
  }
  const values = Array.isArray(value) ? value : [value];
  return values.map(parseItem).filter((item) => item != null);
}
