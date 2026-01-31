import { c, msgid, ngettext, t } from "ttag";

import * as Urls from "metabase/lib/urls";
import type { NamedUser } from "metabase/lib/user";
import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type {
  AnalysisFindingError,
  AnalysisFindingErrorType,
  CardType,
  DependencyEntry,
  DependencyGroupType,
  DependencyId,
  DependencyNode,
  DependencyType,
  Field,
  Transform,
  VisualizationDisplay,
} from "metabase-types/api";

import type {
  DependencyError,
  DependencyErrorGroup,
  DependencyErrorInfo,
  DependencyFilterOptions,
  DependencyGroupTypeInfo,
  DependentGroup,
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
    node.type === "card" ? node.data.query_type : undefined,
  );
}

export function getNodeIconWithType(
  type: DependencyType,
  cardType?: CardType,
  cardDisplay?: VisualizationDisplay,
  queryType?: "native" | "query",
): IconName {
  switch (type) {
    case "card":
      switch (cardType) {
        case "question":
          if (queryType === "native") {
            return "sql";
          }
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
      return "snippet";
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
        label: t`View this dashboard`,
        url: Urls.dashboard({ id: node.id, name: node.data.name }),
      };
    case "document":
      return {
        label: t`View this document`,
        url: Urls.document({ id: node.id }),
      };
    case "sandbox":
      if (node.data.table != null) {
        return {
          label: t`View this permission`,
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
              url: Urls.dataStudioData({
                databaseId: node.data.table.db_id,
                schemaName: node.data.table.schema,
                tableId: node.data.table.id,
                tab: "segments",
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
              url: Urls.dataStudioData({
                databaseId: node.data.table.db_id,
                schemaName: node.data.table.schema,
                tableId: node.data.table.id,
                tab: "measures",
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

export function getNodeOwner(node: DependencyNode): NamedUser | null {
  switch (node.type) {
    case "table":
    case "transform":
      return node.data.owner ?? null;
    default:
      return null;
  }
}

export function canNodeHaveOwner(type: DependencyType): boolean {
  switch (type) {
    case "table":
    case "transform":
      return true;
    default:
      return false;
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
    default:
      return null;
  }
}

export function getNodeCreatedBy(node: DependencyNode): NamedUser | null {
  switch (node.type) {
    case "card":
    case "dashboard":
    case "document":
    case "segment":
    case "measure":
    case "snippet":
    case "transform":
      return node.data.creator ?? null;
    default:
      return null;
  }
}

export function getNodeLastEditedAt(node: DependencyNode): string | null {
  switch (node.type) {
    case "card":
    case "dashboard":
      return node.data["last-edit-info"]?.timestamp ?? null;
    default:
      return null;
  }
}

export function getNodeLastEditedBy(node: DependencyNode): NamedUser | null {
  switch (node.type) {
    case "card":
    case "dashboard":
      return node.data["last-edit-info"] ?? null;
    default:
      return null;
  }
}

export function canNodeHaveViewCount(type: DependencyType): boolean {
  switch (type) {
    case "card":
    case "dashboard":
    case "document":
      return true;
    default:
      return false;
  }
}

export function getNodeViewCount(node: DependencyNode): number | null {
  switch (node.type) {
    case "card":
    case "dashboard":
    case "document":
      return node.data.view_count ?? 0;
    default:
      return null;
  }
}

export function getNodeViewCountLabel(viewCount: number): string {
  return ngettext(msgid`${viewCount} view`, `${viewCount} views`, viewCount);
}

export function getNodeTransform(node: DependencyNode): Transform | null {
  if (node.type === "table") {
    return node.data.transform ?? null;
  }
  return null;
}

export function getNodeFields(node: DependencyNode): Field[] | null {
  switch (node.type) {
    case "card":
      return node.data.result_metadata ?? [];
    case "table":
      return node.data.fields ?? [];
    case "transform":
    case "sandbox":
      return node.data.table?.fields ?? [];
    case "snippet":
    case "dashboard":
    case "document":
    case "segment":
    case "measure":
      return null;
  }
}

export function getNodeFieldsLabel(fieldCount = 0) {
  return fieldCount === 1 ? t`Field` : t`Fields`;
}

export function getNodeFieldsLabelWithCount(fieldCount: number) {
  return ngettext(
    msgid`${fieldCount} field`,
    `${fieldCount} fields`,
    fieldCount,
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

export function getDependencyGroupIcon(groupType: DependencyGroupType) {
  const type = getDependencyType(groupType);
  const cardType = getCardType(groupType);

  return getNodeIconWithType(type, cardType ?? undefined);
}

export function getNodeTypeInfo(node: DependencyNode): DependencyGroupTypeInfo {
  // For SQL questions, return a special label
  if (
    node.type === "card" &&
    node.data.type === "question" &&
    node.data.query_type === "native"
  ) {
    return { label: t`SQL question`, color: "text-secondary" };
  }

  // For all other cases, use the standard group type info
  return getDependencyGroupTypeInfo(getDependencyGroupType(node));
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

export function getDependentGroups(node: DependencyNode): DependentGroup[] {
  const {
    question = 0,
    model = 0,
    metric = 0,
    table = 0,
    transform = 0,
    snippet = 0,
    dashboard = 0,
    document = 0,
    sandbox = 0,
    segment = 0,
    measure = 0,
  } = node.dependents_count ?? {};

  const groups: DependentGroup[] = [
    { type: "question", count: question },
    { type: "model", count: model },
    { type: "metric", count: metric },
    { type: "table", count: table },
    { type: "transform", count: transform },
    { type: "snippet", count: snippet },
    { type: "dashboard", count: dashboard },
    { type: "document", count: document },
    { type: "sandbox", count: sandbox },
    { type: "segment", count: segment },
    { type: "measure", count: measure },
  ];

  return groups.filter(({ count }) => count !== 0);
}

export function getDependentsCount(node: DependencyNode): number {
  if (node.dependents_count == null) {
    return 0;
  }
  return Object.values(node.dependents_count).reduce(
    (total, count) => total + count,
    0,
  );
}

export function getDependencyGroupTitle(
  node: DependencyNode,
  groups: DependentGroup[],
) {
  if (node.type === "sandbox") {
    return t`Restricts table data`;
  }
  if (groups.length === 0) {
    return t`Nothing uses this`;
  }
  if (node.type === "transform") {
    return t`Generates`;
  }
  return t`Used by`;
}

export function getDependentGroupLabel({
  type,
  count,
}: DependentGroup): string {
  switch (type) {
    case "question":
      return ngettext(msgid`${count} question`, `${count} questions`, count);
    case "model":
      return ngettext(msgid`${count} model`, `${count} models`, count);
    case "metric":
      return ngettext(msgid`${count} metric`, `${count} metrics`, count);
    case "table":
      return ngettext(msgid`${count} table`, `${count} tables`, count);
    case "transform":
      return ngettext(msgid`${count} transform`, `${count} transforms`, count);
    case "snippet":
      return ngettext(msgid`${count} snippet`, `${count} snippet`, count);
    case "dashboard":
      return ngettext(msgid`${count} dashboard`, `${count} dashboards`, count);
    case "document":
      return ngettext(msgid`${count} document`, `${count} documents`, count);
    case "sandbox":
      return ngettext(
        msgid`${count} row and column security rule`,
        `${count} row and column security rules`,
        count,
      );
    case "segment":
      return c("{0} is the number of segments").ngettext(
        msgid`${count} segment`,
        `${count} segments`,
        count,
      );
    case "measure":
      return c("{0} is the number of measures").ngettext(
        msgid`${count} measure`,
        `${count} measures`,
        count,
      );
  }
}

function areGroupTypesEqual(
  groupTypes1: DependencyGroupType[],
  groupTypes2: DependencyGroupType[],
): boolean {
  const groupTypes1Set = new Set(groupTypes1);
  return (
    groupTypes1Set.size === groupTypes2.length &&
    groupTypes2.every((groupType) => groupTypes1Set.has(groupType))
  );
}

export function areFilterOptionsEqual(
  filterOptions1: DependencyFilterOptions,
  filterOptions2: DependencyFilterOptions,
): boolean {
  return (
    areGroupTypesEqual(filterOptions1.groupTypes, filterOptions2.groupTypes) &&
    filterOptions1.includePersonalCollections ===
      filterOptions2.includePersonalCollections
  );
}

export function getErrorTypeLabel(
  type: AnalysisFindingErrorType,
  count = 0,
): string {
  switch (type) {
    case "missing-column":
      return count === 1 ? t`Missing column` : t`Missing columns`;
    case "missing-table-alias":
      return count === 1 ? t`Missing table alias` : t`Missing table aliases`;
    case "duplicate-column":
      return count === 1 ? t`Duplicate column` : t`Duplicate columns`;
    case "syntax-error":
      return count === 1 ? t`Syntax error` : t`Syntax errors`;
    case "validation-error":
      return count === 1 ? t`Unknown problem` : t`Unknown problems`;
  }
}

export function getErrorTypeLabelWithCount(
  type: AnalysisFindingErrorType,
  count = 0,
): string {
  switch (type) {
    case "missing-column":
      return ngettext(
        msgid`${count} missing column`,
        `${count} missing columns`,
        count,
      );
    case "missing-table-alias":
      return ngettext(
        msgid`${count} missing table alias`,
        `${count} missing table aliases`,
        count,
      );
    case "duplicate-column":
      return ngettext(
        msgid`${count} duplicate column`,
        `${count} duplicate columns`,
        count,
      );
    case "syntax-error":
      return ngettext(
        msgid`${count} syntax error`,
        `${count} syntax errors`,
        count,
      );
    case "validation-error":
      return ngettext(
        msgid`${count} unknown problem`,
        `${count} unknown problems`,
        count,
      );
  }
}

export function getDependentErrorNodesLabel(count = 0): string {
  return count === 1 ? t`Broken dependent` : t`Broken dependents`;
}

export function getDependencyErrors(
  errors: AnalysisFindingError[],
): DependencyError[] {
  const errorByKey = new Map<string, DependencyError>();
  for (const error of errors) {
    const { error_type: type, error_detail: detail } = error;
    const key = `${type}-${detail}`;
    errorByKey.set(key, { type, detail });
  }
  return Array.from(errorByKey.values());
}

export function getDependencyErrorGroups(
  errors: DependencyError[],
): DependencyErrorGroup[] {
  const groups = new Map<AnalysisFindingErrorType, DependencyError[]>();
  for (const error of errors) {
    const group = groups.get(error.type);
    if (group != null) {
      group.push(error);
    } else {
      groups.set(error.type, [error]);
    }
  }
  return Array.from(groups.entries()).map(([type, errors]) => ({
    type,
    errors,
  }));
}

export function getDependencyErrorInfo(
  errors: DependencyError[],
): DependencyErrorInfo | undefined {
  if (errors.length === 0) {
    return undefined;
  }

  if (errors.length === 1) {
    const [error] = errors;
    const label = getErrorTypeLabel(error.type, errors.length);
    const detail = error.detail;
    return { label, detail };
  }

  const types = new Set(errors.map((error) => error.type));
  if (types.size === 1) {
    const [type] = types;
    return {
      label: getErrorTypeLabelWithCount(type, errors.length),
      detail: null,
    };
  }

  return {
    label: ngettext(
      msgid`${errors.length} problem`,
      `${errors.length} problems`,
      errors.length,
    ),
    detail: null,
  };
}

export function getDependentErrorNodesCount(
  errors: AnalysisFindingError[],
): number {
  const nodeIds = new Set();
  errors.forEach((error) => {
    nodeIds.add(
      getNodeId(error.analyzed_entity_id, error.analyzed_entity_type),
    );
  });
  return nodeIds.size;
}

export function getSearchQuery(searchValue: string): string | undefined {
  const searchQuery = searchValue.trim();
  return searchQuery.length > 0 ? searchQuery : undefined;
}
