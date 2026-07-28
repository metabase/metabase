import { P, match } from "ts-pattern";
import { t } from "ttag";

import * as Urls from "metabase/urls";
import type { Sorting } from "metabase/utils/sorting";
import {
  CONTENT_DIAGNOSTICS_FILTER_TYPES,
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
  return match(finding)
    .with({ entity_type: "card", card_type: "model" }, () => "model" as const)
    .with({ entity_type: "card", card_type: "metric" }, () => "metric" as const)
    .with({ entity_type: "card" }, () => "table2" as const)
    .with({ entity_type: "dashboard" }, () => "dashboard" as const)
    .with({ entity_type: "document" }, () => "document" as const)
    .with({ entity_type: "transform" }, () => "transform" as const)
    .exhaustive();
}

export function getEntityTypeLabel(finding: ContentDiagnosticsFinding): string {
  return match(finding)
    .with({ entity_type: "card", card_type: "model" }, () => t`Model`)
    .with({ entity_type: "card", card_type: "metric" }, () => t`Metric`)
    .with({ entity_type: "card" }, () => t`Question`)
    .with({ entity_type: "dashboard" }, () => t`Dashboard`)
    .with({ entity_type: "document" }, () => t`Document`)
    .with({ entity_type: "transform" }, () => t`Transform`)
    .exhaustive();
}

export function getEntityViewLabel(finding: ContentDiagnosticsFinding): string {
  return match(finding)
    .with({ entity_type: "card", card_type: "model" }, () => t`View this model`)
    .with(
      { entity_type: "card", card_type: "metric" },
      () => t`View this metric`,
    )
    .with({ entity_type: "card" }, () => t`View this question`)
    .with({ entity_type: "dashboard" }, () => t`View this dashboard`)
    .with({ entity_type: "document" }, () => t`View this document`)
    .with({ entity_type: "transform" }, () => t`View this transform`)
    .exhaustive();
}

export function getLastActiveLabel(
  entityType: ContentDiagnosticsEntityType,
): string {
  return match(entityType)
    .with("card", () => t`Last used`)
    .with("dashboard", () => t`Last viewed`)
    .with("document", () => t`Last viewed`)
    .with("transform", () => t`Last run`)
    .exhaustive();
}

export function getEntityName(finding: ContentDiagnosticsFinding): string {
  return finding.entity_display_name ?? t`Untitled`;
}

export function getEntityUrl(finding: ContentDiagnosticsFinding): string {
  const entity = {
    id: finding.entity_id,
    name: getEntityName(finding),
  };

  return match(finding)
    .with({ entity_type: "card" }, (finding) =>
      Urls.card({ ...entity, type: finding.card_type ?? undefined }),
    )
    .with({ entity_type: "dashboard" }, () => Urls.dashboard(entity))
    .with({ entity_type: "document" }, (finding) =>
      Urls.document({ id: finding.entity_id }),
    )
    .with({ entity_type: "transform" }, (finding) =>
      Urls.transform(finding.entity_id),
    )
    .exhaustive();
}

export function getCollectionPath(
  collection: ContentDiagnosticsCollection | null,
): string {
  return match(collection)
    .with(null, () => t`Our analytics`)
    .otherwise((collection) =>
      [...collection.effective_ancestors, collection]
        .map((entry) => entry.name)
        .join(" / "),
    );
}

function getCollectionBreadcrumbUrl(
  entry: ContentDiagnosticsCollectionBreadcrumbEntry,
): string {
  return Urls.collection({ id: entry.id, name: entry.name });
}

export function getBreadcrumbLinks(
  finding: ContentDiagnosticsFinding,
): ContentDiagnosticsBreadcrumbLink[] {
  return match(finding.details.collection)
    .with(null, () => [
      {
        id: "root",
        label: t`Our analytics`,
        url: Urls.collection(),
        icon: "folder" as const,
      },
    ])
    .otherwise((collection) =>
      [...collection.effective_ancestors, collection].map((entry, index) => ({
        id: String(entry.id),
        label: entry.name,
        url: getCollectionBreadcrumbUrl(entry),
        icon: index === 0 ? ("folder" as const) : undefined,
      })),
    );
}

export function getUserName(user: ContentDiagnosticsUser | null): string {
  return match(user)
    .with(null, () => "—")
    .with({ type: "user" }, (user) => user.name ?? user.email ?? "—")
    .with({ type: "external" }, (user) => user.email ?? "—")
    .exhaustive();
}

export function getFilterTypeLabel(type: ContentDiagnosticsFilterType): string {
  return match(type)
    .with("card", () => t`Cards`)
    .with("dashboard", () => t`Dashboards`)
    .with("document", () => t`Documents`)
    .with("transform", () => t`Transforms`)
    .exhaustive();
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
  return match(entityTypes)
    .when(
      (entityTypes) => entityTypes.length === ALL_FILTER_TYPES.length,
      () => undefined,
    )
    .otherwise((entityTypes) => entityTypes);
}

export function getSortOptions({
  sortColumn,
  sortDirection,
}: Urls.ContentDiagnosticsParams):
  | Sorting<ContentDiagnosticsSortColumn>
  | undefined {
  return match({ sortColumn, sortDirection })
    .with(
      { sortColumn: P.nonNullable, sortDirection: P.nonNullable },
      ({ sortColumn, sortDirection }) => ({
        column: sortColumn,
        direction: sortDirection,
      }),
    )
    .otherwise(() => undefined);
}
