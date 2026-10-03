const { H } = cy;

import type { CardId, DocumentContent } from "metabase-types/api";

export type ContentDiagnosticsTab =
  | "stale"
  | "slow"
  | "duplicated"
  | "empty"
  | "sparse"
  | "crowded";

export type StaleModel = "card" | "dashboard" | "document" | "transform";

export type ThresholdSetting =
  | "content-diagnostics-stale-threshold-days"
  | "content-diagnostics-slow-card-threshold-seconds"
  | "content-diagnostics-slow-transform-threshold-seconds"
  | "content-diagnostics-crowded-collection-threshold-items"
  | "content-diagnostics-crowded-dashboard-threshold-dashcards-per-tab"
  | "content-diagnostics-crowded-dashboard-threshold-tabs"
  | "content-diagnostics-crowded-document-threshold-cards"
  | "content-diagnostics-sparse-collection-threshold-items"
  | "content-diagnostics-sparse-dashboard-threshold-dashcards";

const FINDINGS_ALIAS = "findings";

// Empty, sparse and crowded are three views over the single imbalanced endpoint.
const TAB_ENDPOINTS: Record<ContentDiagnosticsTab, string> = {
  stale: "stale",
  slow: "slow",
  duplicated: "duplicated",
  empty: "imbalanced",
  sparse: "imbalanced",
  crowded: "imbalanced",
};

// `H.updateSetting` / `H.updateEnterpriseSetting` accepts admin-visible settings, content
// diagnostics thresholds aren't exposed in that type, so we call API directly.
export function setThreshold(setting: ThresholdSetting, value: number) {
  return cy.request("PUT", `/api/setting/${setting}`, { value });
}

export function runContentDiagnosticsScan() {
  return cy.request("POST", "/api/testing/content-diagnostics/scan");
}

// `dateStr` is a "YYYY-MM-DD" date; the endpoint backdates by seven months when it is omitted.
export function markStale(
  model: StaleModel,
  id: number | string,
  dateStr?: string,
) {
  return cy.request("POST", "/api/testing/mark-stale", {
    id,
    model,
    ...(dateStr ? { "date-str": dateStr } : {}),
  });
}

export function visitContentDiagnosticsTab(tab: ContentDiagnosticsTab) {
  cy.intercept("GET", `/api/ee/content-diagnostics/${TAB_ENDPOINTS[tab]}*`).as(
    FINDINGS_ALIAS,
  );
  cy.visit(`/monitor/content-diagnostics/${tab}`);
  cy.wait(`@${FINDINGS_ALIAS}`);
}

export function documentEmbedding(cardIds: CardId[]): DocumentContent {
  return {
    type: "doc",
    content: cardIds.map((id, index) => ({
      type: "resizeNode",
      attrs: { height: 400, minHeight: 280 },
      content: [
        {
          type: "cardEmbed",
          attrs: { id, name: null, _id: String(index + 1) },
        },
      ],
    })),
  };
}

// Creating a document clones any card its embeds point at into a document-owned copy and rewrites the embed, so the stored ids are not the ones it was created with.
export function embeddedCardIds(document: DocumentContent): CardId[] {
  return (document.content ?? []).flatMap((block) =>
    (block.content ?? [])
      .filter((node) => node.type === "cardEmbed")
      .map((node) => node.attrs?.id),
  );
}

// A scan covers the whole instance, so searching is what narrows the table to the seeded entities.
export function searchFindings(term: string) {
  H.main().findByLabelText("Search").type(term);
  cy.wait(`@${FINDINGS_ALIAS}`);
}
