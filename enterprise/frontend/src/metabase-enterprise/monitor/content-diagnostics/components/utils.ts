import { match } from "ts-pattern";
import { t } from "ttag";

import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_FILTER_TYPES,
  CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
  type CollectionNamespace,
  type ContentDiagnosticsBaseFinding,
  type ContentDiagnosticsCollection,
  type ContentDiagnosticsDuplicateEntity,
  type ContentDiagnosticsFilterType,
  type ContentDiagnosticsNonCollectionFilterType,
  type ContentDiagnosticsUser,
  type IconName,
} from "metabase-types/api";

export const ALL_NON_COLLECTION_FILTER_TYPES: ContentDiagnosticsNonCollectionFilterType[] =
  [...CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES];

export const ALL_FILTER_TYPES: ContentDiagnosticsFilterType[] = [
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

type ContentDiagnosticsEntityKind = Pick<
  ContentDiagnosticsBaseFinding,
  "entity_type" | "card_type"
>;

type ContentDiagnosticsEntityTarget = ContentDiagnosticsEntityKind & {
  id: number;
  name: string;
};

export function getEntityIcon(entity: ContentDiagnosticsEntityKind): IconName {
  return match(entity)
    .with({ entity_type: "card", card_type: "model" }, () => "model" as const)
    .with({ entity_type: "card", card_type: "metric" }, () => "metric" as const)
    .with({ entity_type: "card" }, () => "table2" as const)
    .with({ entity_type: "dashboard" }, () => "dashboard" as const)
    .with({ entity_type: "document" }, () => "document" as const)
    .with({ entity_type: "transform" }, () => "transform" as const)
    .with({ entity_type: "collection" }, () => "folder" as const)
    .exhaustive();
}

export function getEntityTypeLabel(
  entity: ContentDiagnosticsEntityKind,
): string {
  return match(entity)
    .with({ entity_type: "card", card_type: "model" }, () => t`Model`)
    .with({ entity_type: "card", card_type: "metric" }, () => t`Metric`)
    .with({ entity_type: "card" }, () => t`Question`)
    .with({ entity_type: "dashboard" }, () => t`Dashboard`)
    .with({ entity_type: "document" }, () => t`Document`)
    .with({ entity_type: "transform" }, () => t`Transform`)
    .with({ entity_type: "collection" }, () => t`Collection`)
    .exhaustive();
}

export function getEntityViewLabel(
  entity: ContentDiagnosticsEntityKind,
): string {
  return match(entity)
    .with({ entity_type: "card", card_type: "model" }, () => t`View this model`)
    .with(
      { entity_type: "card", card_type: "metric" },
      () => t`View this metric`,
    )
    .with({ entity_type: "card" }, () => t`View this question`)
    .with({ entity_type: "dashboard" }, () => t`View this dashboard`)
    .with({ entity_type: "document" }, () => t`View this document`)
    .with({ entity_type: "transform" }, () => t`View this transform`)
    .with({ entity_type: "collection" }, () => t`View this collection`)
    .exhaustive();
}

function getDisplayName(name: string | null): string {
  return name ?? t`Untitled`;
}

export function getEntityName(finding: ContentDiagnosticsBaseFinding): string {
  return getDisplayName(finding.entity_display_name);
}

export function getDuplicateEntityName(
  entity: ContentDiagnosticsDuplicateEntity,
): string {
  return getDisplayName(entity.name);
}

function getTargetUrl(entity: ContentDiagnosticsEntityTarget): string {
  return match(entity)
    .with({ entity_type: "card" }, (entity) =>
      Urls.card({
        id: entity.id,
        name: entity.name,
        type: entity.card_type ?? undefined,
      }),
    )
    .with({ entity_type: "dashboard" }, (entity) =>
      Urls.dashboard({ id: entity.id, name: entity.name }),
    )
    .with({ entity_type: "document" }, (entity) =>
      Urls.document({ id: entity.id }),
    )
    .with({ entity_type: "transform" }, (entity) => Urls.transform(entity.id))
    .with({ entity_type: "collection" }, (entity) =>
      Urls.collection({ id: entity.id, name: entity.name }),
    )
    .exhaustive();
}

export function getEntityUrl(finding: ContentDiagnosticsBaseFinding): string {
  return getTargetUrl({
    entity_type: finding.entity_type,
    card_type: finding.card_type,
    id: finding.entity_id,
    name: getEntityName(finding),
  });
}

export function getDuplicateEntityUrl(
  entity: ContentDiagnosticsDuplicateEntity,
): string {
  return getTargetUrl({
    entity_type: entity.entity_type,
    card_type: entity.card_type,
    id: entity.id,
    name: getDuplicateEntityName(entity),
  });
}

export function getCollectionName(
  collection: ContentDiagnosticsCollection | null,
): string {
  return match(collection)
    .with(null, () => t`Our analytics`)
    .otherwise((collection) => collection.name);
}

function getCollectionBreadcrumbUrl(
  entry: ContentDiagnosticsCollectionBreadcrumbEntry,
  namespace: CollectionNamespace,
): string {
  return namespace === "transforms"
    ? Urls.transformList({ collectionId: entry.id })
    : Urls.collection({ id: entry.id, name: entry.name });
}

export function getBreadcrumbLinks(
  finding: ContentDiagnosticsBaseFinding,
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
        url: getCollectionBreadcrumbUrl(entry, collection.namespace),
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
    .with("question", () => t`Questions`)
    .with("model", () => t`Models`)
    .with("metric", () => t`Metrics`)
    .with("dashboard", () => t`Dashboards`)
    .with("document", () => t`Documents`)
    .with("transform", () => t`Transforms`)
    .with("collection", () => t`Collections`)
    .exhaustive();
}

export function areEntityTypesEqual(
  a: ContentDiagnosticsFilterType[],
  b: ContentDiagnosticsFilterType[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const setB = new Set(b);
  return a.every((type) => setB.has(type));
}
