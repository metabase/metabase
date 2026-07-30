import { match } from "ts-pattern";
import { t } from "ttag";

import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_FILTER_TYPES,
  type ContentDiagnosticsBaseFinding,
  type ContentDiagnosticsCollection,
  type ContentDiagnosticsFilterType,
  type ContentDiagnosticsUser,
  type IconName,
} from "metabase-types/api";

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

export function getEntityIcon(
  finding: ContentDiagnosticsBaseFinding,
): IconName {
  return match(finding)
    .with({ entity_type: "card", card_type: "model" }, () => "model" as const)
    .with({ entity_type: "card", card_type: "metric" }, () => "metric" as const)
    .with({ entity_type: "card" }, () => "table2" as const)
    .with({ entity_type: "dashboard" }, () => "dashboard" as const)
    .with({ entity_type: "document" }, () => "document" as const)
    .with({ entity_type: "transform" }, () => "transform" as const)
    .exhaustive();
}

export function getEntityTypeLabel(
  finding: ContentDiagnosticsBaseFinding,
): string {
  return match(finding)
    .with({ entity_type: "card", card_type: "model" }, () => t`Model`)
    .with({ entity_type: "card", card_type: "metric" }, () => t`Metric`)
    .with({ entity_type: "card" }, () => t`Question`)
    .with({ entity_type: "dashboard" }, () => t`Dashboard`)
    .with({ entity_type: "document" }, () => t`Document`)
    .with({ entity_type: "transform" }, () => t`Transform`)
    .exhaustive();
}

export function getEntityViewLabel(
  finding: ContentDiagnosticsBaseFinding,
): string {
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

export function getEntityName(finding: ContentDiagnosticsBaseFinding): string {
  return finding.entity_display_name ?? t`Untitled`;
}

export function getEntityUrl(finding: ContentDiagnosticsBaseFinding): string {
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

export function getCollectionName(
  collection: ContentDiagnosticsCollection | null,
): string {
  return match(collection)
    .with(null, () => t`Our analytics`)
    .otherwise((collection) => collection.name);
}

function getCollectionBreadcrumbUrl(
  entry: ContentDiagnosticsCollectionBreadcrumbEntry,
): string {
  return Urls.collection({ id: entry.id, name: entry.name });
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
    .with("question", () => t`Questions`)
    .with("model", () => t`Models`)
    .with("metric", () => t`Metrics`)
    .with("dashboard", () => t`Dashboards`)
    .with("document", () => t`Documents`)
    .with("transform", () => t`Transforms`)
    .exhaustive();
}

export function getAvailableFilterTypes(): ContentDiagnosticsFilterType[] {
  return ALL_FILTER_TYPES;
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
