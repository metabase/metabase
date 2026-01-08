import { msgid, ngettext, t } from "ttag";

import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type {
  CardType,
  DependencyEntry,
  DependencyError,
  DependencyErrorType,
  DependencyGroupType,
  DependencyId,
  DependencyNode,
  DependencyType,
  LastEditInfo,
  UserInfo,
  VisualizationDisplay,
} from "metabase-types/api";

import type {
  DependencyErrorInfo,
  DependencyGroupTypeInfo,
  NodeId,
  NodeLink,
  NodeLocationInfo,
} from "./types";

export function isSameNode(
  entry1: DependencyEntry,
  entry2: DependencyEntry,
): boolean {
  return entry1.id === entry2.id && entry1.type === entry2.type;
}

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
    case "measure":
      return "sum";
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
        url: Urls.dataStudioData({
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
      if (node.data.table != null) {
        return {
          label: t`View this segment`,
          url: Urls.dataStudioDataModelSegment({
            databaseId: node.data.table.db_id,
            schemaName: node.data.table.schema,
            tableId: node.data.table.id,
            segmentId: node.id,
          }),
        };
      }
      return null;
    case "measure":
      if (node.data.table != null) {
        return {
          label: t`View this measure`,
          url: Urls.dataStudioDataModelMeasure({
            databaseId: node.data.table.db_id,
            schemaName: node.data.table.schema,
            tableId: node.data.table.id,
            measureId: node.id,
          }),
        };
      }
      return null;
    case "snippet":
      return {
        label: t`View this snippet`,
        url: Urls.dataStudioSnippet(node.id),
      };
  }
}

export function getNodeLocationInfo(
  node: DependencyNode,
): NodeLocationInfo | null {
  switch (node.type) {
    case "card":
      if (node.data.dashboard != null) {
        return {
          icon: "dashboard",
          links: [
            {
              label: node.data.dashboard.name,
              url: Urls.dashboard(node.data.dashboard),
            },
          ],
        };
      }
      if (node.data.document != null) {
        return {
          icon: "document",
          links: [
            {
              label: node.data.document.name,
              url: Urls.document(node.data.document),
            },
          ],
        };
      }
      if (node.data.collection != null) {
        return {
          icon: "collection",
          links: [
            {
              label: node.data.collection.name,
              url: Urls.collection(node.data.collection),
            },
          ],
        };
      }
      return null;
    case "table":
      if (node.data.db != null) {
        return {
          icon: "database",
          links: [
            {
              label: node.data.db.name,
              url: Urls.dataStudioData({ databaseId: node.data.db_id }),
            },
            {
              label: node.data.schema,
              url: Urls.dataStudioData({
                databaseId: node.data.db_id,
                schemaName: node.data.schema,
              }),
            },
          ],
        };
      }
      return null;
    case "dashboard":
    case "document":
      if (node.data.collection != null) {
        return {
          icon: "collection",
          links: [
            {
              label: node.data.collection.name,
              url: Urls.collection(node.data.collection),
            },
          ],
        };
      }
      return null;
    case "segment":
      if (node.data.table != null) {
        return {
          icon: "table",
          links: [
            {
              label: node.data.table.display_name,
              url: Urls.dataStudioDataModelSegment({
                databaseId: node.data.table.db_id,
                schemaName: node.data.table.schema,
                tableId: node.data.table.id,
                segmentId: node.id,
              }),
            },
          ],
        };
      }
      return null;
    case "measure":
      if (node.data.table != null) {
        return {
          icon: "table",
          links: [
            {
              label: node.data.table.display_name,
              url: Urls.dataStudioDataModelMeasure({
                databaseId: node.data.table.db_id,
                schemaName: node.data.table.schema,
                tableId: node.data.table.id,
                measureId: node.id,
              }),
            },
          ],
        };
      }
      return null;
    case "snippet":
      if (node.data.collection != null) {
        return {
          icon: "collection",
          links: [
            {
              label: node.data.collection.name,
              url: Urls.dataStudioLibrary(),
            },
          ],
        };
      }
      return null;
    case "transform":
    case "sandbox":
      return null;
  }
}

export function getNodeCreatedAt(node: DependencyNode): string | null {
  switch (node.type) {
    case "card":
    case "dashboard":
    case "document":
    case "segment":
    case "measure":
    case "snippet":
    case "transform":
      return node.data.created_at;
    case "table":
    case "sandbox":
      return null;
  }
}

export function getNodeCreatedBy(node: DependencyNode): UserInfo | null {
  switch (node.type) {
    case "card":
    case "dashboard":
    case "document":
    case "segment":
    case "measure":
    case "snippet":
    case "transform":
      return node.data.creator ?? null;
    case "table":
    case "sandbox":
      return null;
  }
}

export function getNodeLastEditedAt(node: DependencyNode): string | null {
  switch (node.type) {
    case "card":
    case "dashboard":
      return node.data["last-edit-info"]?.timestamp ?? null;
    case "segment":
    case "measure":
    case "table":
    case "transform":
    case "snippet":
    case "document":
    case "sandbox":
      return null;
  }
}

export function getNodeLastEditedBy(node: DependencyNode): LastEditInfo | null {
  switch (node.type) {
    case "card":
    case "dashboard":
      return node.data["last-edit-info"] ?? null;
    case "segment":
    case "measure":
    case "table":
    case "transform":
    case "snippet":
    case "document":
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
    case "measure":
    case "transform":
    case "snippet":
    case "sandbox":
    case "segment":
      return null;
  }
}

export function getNodeDependentsCount(node: DependencyNode): number {
  const dependentsCount = node.dependents_count;
  if (dependentsCount == null) {
    return 0;
  }
  return Object.values(dependentsCount).reduce(
    (total, count) => total + count,
    0,
  );
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

export function getDependencyGroupType(
  node: DependencyNode,
): DependencyGroupType {
  switch (node.type) {
    case "card":
      return node.data.type;
    case "table":
      return "table";
    case "transform":
      return "transform";
    case "dashboard":
      return "dashboard";
    case "document":
      return "document";
    case "sandbox":
      return "sandbox";
    case "segment":
      return "segment";
    case "measure":
      return "measure";
    case "snippet":
      return "snippet";
  }
}

export function getDependencyGroupTypeInfo(
  groupType: DependencyGroupType,
): DependencyGroupTypeInfo {
  switch (groupType) {
    case "question":
      return { label: t`Question`, color: "text-secondary" };
    case "model":
      return { label: t`Model`, color: "brand" };
    case "metric":
      return { label: t`Metric`, color: "summarize" };
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
    case "measure":
      return { label: t`Measure`, color: "summarize" };
  }
}

export function getDependencyTypes(
  groupTypes: DependencyGroupType[],
): DependencyType[] {
  const types = groupTypes.map(getDependencyType);
  return Array.from(new Set(types));
}

export function getCardTypes(groupTypes: DependencyGroupType[]): CardType[] {
  const cardTypes = groupTypes
    .map(getCardType)
    .filter((cardType) => cardType !== null);
  return Array.from(new Set(cardTypes));
}

export function getDependencyErrorTypeLabel(type: DependencyErrorType): string {
  switch (type) {
    case "validate/missing-column":
      return t`Missing column`;
    case "validate/missing-table-alias":
      return t`Missing table alias`;
    case "validate/duplicate-column":
      return t`Duplicate column`;
    case "validate/syntax-error":
      return t`Syntax error`;
    case "validate/validation-error":
      return t`Unknown error`;
  }
}

export function getDependencyErrorTypeCountMessage(
  type: DependencyErrorType,
  count: number,
): string {
  switch (type) {
    case "validate/missing-column":
      return ngettext(
        msgid`${count} missing column`,
        `${count} missing columns`,
        count,
      );
    case "validate/missing-table-alias":
      return ngettext(
        msgid`${count} missing table alias`,
        `${count} missing table aliases`,
        count,
      );
    case "validate/duplicate-column":
      return ngettext(
        msgid`${count} duplicate column`,
        `${count} duplicate columns`,
        count,
      );
    case "validate/syntax-error":
      return ngettext(
        msgid`${count} syntax error`,
        `${count} syntax errors`,
        count,
      );
    case "validate/validation-error":
      return ngettext(
        msgid`${count} unknown error`,
        `${count} unknown errors`,
        count,
      );
  }
}

export function getDependencyErrorDetail(
  error: DependencyError,
): string | null {
  switch (error.type) {
    case "validate/missing-column":
    case "validate/missing-table-alias":
    case "validate/duplicate-column":
      return error.name;
    case "validate/syntax-error":
    case "validate/validation-error":
      return null;
  }
}

export function getDependencyErrorInfo(
  errors: DependencyError[],
): DependencyErrorInfo | undefined {
  if (errors.length === 0) {
    return undefined;
  }

  if (errors.length === 1) {
    const [error] = errors;
    const label = getDependencyErrorTypeLabel(error.type);
    const detail = getDependencyErrorDetail(error);
    return { label, detail };
  }

  const types = new Set(errors.map((error) => error.type));
  if (types.size === 1) {
    const [type] = types;
    return {
      label: getDependencyErrorTypeCountMessage(type, errors.length),
      detail: null,
    };
  }

  return {
    label: ngettext(
      msgid`${errors.length} error`,
      `${errors.length} errors`,
      errors.length,
    ),
    detail: null,
  };
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

export function getSearchQuery(searchValue: string): string | undefined {
  const searchQuery = searchValue.trim();
  return searchQuery.length > 0 ? searchQuery : undefined;
}
