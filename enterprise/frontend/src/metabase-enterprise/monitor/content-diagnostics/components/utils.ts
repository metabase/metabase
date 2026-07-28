import { t } from "ttag";

import * as Urls from "metabase/urls";
import type { Sorting } from "metabase/utils/sorting";
import {
  CONTENT_DIAGNOSTICS_FILTER_TYPES,
  type CardType,
  type ContentDiagnosticsCollection,
  type ContentDiagnosticsEntityType,
  type ContentDiagnosticsFilterType,
  type ContentDiagnosticsFinding,
  type ContentDiagnosticsSortColumn,
  type ContentDiagnosticsUser,
  type IconName,
} from "metabase-types/api";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "./constants";
import type { ContentDiagnosticsFilterOptions } from "./types";

const ALL_FILTER_TYPES: ContentDiagnosticsFilterType[] = [
  ...CONTENT_DIAGNOSTICS_FILTER_TYPES,
];

const ENTITY_TYPE_ICONS: Record<ContentDiagnosticsEntityType, IconName> = {
  card: "table2",
  dashboard: "dashboard",
  document: "document",
  transform: "transform",
};

const CARD_TYPE_ICONS: Record<CardType, IconName> = {
  question: "table2",
  model: "model",
  metric: "metric",
};

type ContentDiagnosticsCollectionBreadcrumbEntry =
  | ContentDiagnosticsCollection
  | ContentDiagnosticsCollection["effective_ancestors"][number];

export type ContentDiagnosticsBreadcrumbLink = {
  id: string;
  label: string;
  url: string;
  icon?: IconName;
};

export function getEntityIcon(finding: ContentDiagnosticsFinding): IconName {
  if (finding.entity_type === "card" && finding.card_type != null) {
    return CARD_TYPE_ICONS[finding.card_type];
  }
  return ENTITY_TYPE_ICONS[finding.entity_type];
}

export function getEntityTypeLabel(finding: ContentDiagnosticsFinding): string {
  switch (finding.entity_type) {
    case "card":
      return getCardTypeLabel(finding.card_type);
    case "dashboard":
      return t`Dashboard`;
    case "document":
      return t`Document`;
    case "transform":
      return t`Transform`;
  }
}

export function getEntityViewLabel(finding: ContentDiagnosticsFinding): string {
  switch (finding.entity_type) {
    case "card":
      return getCardViewLabel(finding.card_type);
    case "dashboard":
      return t`View this dashboard`;
    case "document":
      return t`View this document`;
    case "transform":
      return t`View this transform`;
  }
}

function getCardTypeLabel(cardType: CardType | null | undefined): string {
  switch (cardType) {
    case "model":
      return t`Model`;
    case "metric":
      return t`Metric`;
    default:
      return t`Question`;
  }
}

function getCardViewLabel(cardType: CardType | null | undefined): string {
  switch (cardType) {
    case "model":
      return t`View this model`;
    case "metric":
      return t`View this metric`;
    default:
      return t`View this question`;
  }
}

export function getLastActiveLabel(
  entityType: ContentDiagnosticsEntityType,
): string {
  switch (entityType) {
    case "card":
      return t`Last used`;
    case "dashboard":
    case "document":
      return t`Last viewed`;
    case "transform":
      return t`Last run`;
  }
}

export function getEntityName(finding: ContentDiagnosticsFinding): string {
  return finding.entity_display_name ?? t`Untitled`;
}

export function getEntityUrl(finding: ContentDiagnosticsFinding): string {
  const entity = {
    id: finding.entity_id,
    name: getEntityName(finding),
  };

  switch (finding.entity_type) {
    case "card":
      // Urls.card derives /question|/model|/metric from `type`; pass it so
      // models/metrics link directly instead of via the /question/ redirect.
      return Urls.card({ ...entity, type: finding.card_type ?? undefined });
    case "dashboard":
      return Urls.dashboard(entity);
    case "document":
      return Urls.document({ id: finding.entity_id });
    case "transform":
      return Urls.transform(finding.entity_id);
  }
}

export function getCollectionPath(
  collection: ContentDiagnosticsCollection | null,
): string {
  if (collection == null) {
    return t`Our analytics`;
  }
  return [...collection.effective_ancestors, collection]
    .map((entry) => entry.name)
    .join(" / ");
}

function getCollectionBreadcrumbUrl(
  entry: ContentDiagnosticsCollectionBreadcrumbEntry,
): string {
  return Urls.collection({ id: entry.id, name: entry.name });
}

export function getBreadcrumbLinks(
  finding: ContentDiagnosticsFinding,
): ContentDiagnosticsBreadcrumbLink[] {
  if (finding.details.collection == null) {
    return [
      {
        id: "root",
        label: t`Our analytics`,
        url: Urls.collection(),
        icon: "folder" as const,
      },
    ];
  }

  return [
    ...finding.details.collection.effective_ancestors,
    finding.details.collection,
  ].map((entry, index) => ({
    id: String(entry.id),
    label: entry.name,
    url: getCollectionBreadcrumbUrl(entry),
    icon: index === 0 ? ("folder" as const) : undefined,
  }));
}

export function getUserName(user: ContentDiagnosticsUser | null): string {
  if (user == null) {
    return "—";
  }
  if (user.type === "user") {
    return user.name ?? user.email ?? "—";
  }
  return user.email ?? "—";
}

export function getFilterTypeLabel(type: ContentDiagnosticsFilterType): string {
  switch (type) {
    case "card":
      return t`Questions`;
    case "dashboard":
      return t`Dashboards`;
    case "document":
      return t`Documents`;
    case "transform":
      return t`Transforms`;
  }
}

export function getAvailableFilterTypes(): ContentDiagnosticsFilterType[] {
  return ALL_FILTER_TYPES;
}

export function getDefaultFilterOptions(): ContentDiagnosticsFilterOptions {
  return {
    entityTypes: ALL_FILTER_TYPES,
    includePersonalCollections: DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  };
}

export function getFilterOptions(
  params: Urls.ContentDiagnosticsParams,
): ContentDiagnosticsFilterOptions {
  return {
    entityTypes: params.entityTypes ?? ALL_FILTER_TYPES,
    includePersonalCollections:
      params.includePersonalCollections ?? DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  };
}

function areEntityTypesEqual(
  a: ContentDiagnosticsFilterType[],
  b: ContentDiagnosticsFilterType[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const setB = new Set(b);
  return a.every((type) => setB.has(type));
}

export function areFilterOptionsEqual(
  a: ContentDiagnosticsFilterOptions,
  b: ContentDiagnosticsFilterOptions,
): boolean {
  return (
    areEntityTypesEqual(a.entityTypes, b.entityTypes) &&
    a.includePersonalCollections === b.includePersonalCollections
  );
}

export function getFilterParams(
  filterOptions: ContentDiagnosticsFilterOptions,
): Pick<
  Urls.ContentDiagnosticsParams,
  "entityTypes" | "includePersonalCollections"
> {
  const isAllTypes =
    filterOptions.entityTypes.length === ALL_FILTER_TYPES.length;
  const isDefaultPersonal =
    filterOptions.includePersonalCollections ===
    DEFAULT_INCLUDE_PERSONAL_COLLECTIONS;
  return {
    entityTypes: isAllTypes ? undefined : filterOptions.entityTypes,
    includePersonalCollections: isDefaultPersonal
      ? undefined
      : filterOptions.includePersonalCollections,
  };
}

export function getParamsWithoutDefaults({
  page,
  entityTypes,
  includePersonalCollections,
  ...params
}: Urls.ContentDiagnosticsParams): Urls.ContentDiagnosticsParams {
  return {
    ...params,
    page: page === 0 ? undefined : page,
    entityTypes:
      entityTypes?.length === ALL_FILTER_TYPES.length ? undefined : entityTypes,
    includePersonalCollections:
      includePersonalCollections === DEFAULT_INCLUDE_PERSONAL_COLLECTIONS
        ? undefined
        : includePersonalCollections,
  };
}

export function getEntityTypesParam(
  entityTypes: ContentDiagnosticsFilterType[],
): ContentDiagnosticsFilterType[] | undefined {
  return entityTypes.length === ALL_FILTER_TYPES.length
    ? undefined
    : entityTypes;
}

export function getSortOptions({
  sortColumn,
  sortDirection,
}: Urls.ContentDiagnosticsParams):
  | Sorting<ContentDiagnosticsSortColumn>
  | undefined {
  if (sortColumn == null || sortDirection == null) {
    return undefined;
  }
  return { column: sortColumn, direction: sortDirection };
}
