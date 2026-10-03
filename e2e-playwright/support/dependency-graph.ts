/**
 * Helpers for the dependency-graph spec port
 * (e2e/test/scenarios/dependencies/dependency-graph.cy.spec.ts).
 *
 * New helpers only — the shared support/*.ts modules are imported, never
 * edited. This module carries the `H` helpers that have no shared-module home
 * yet:
 * - H.DependencyGraph.* locators (e2e-dependency-helpers.ts)
 * - H.waitForBackfillComplete (e2e-dependency-helpers.ts)
 * - H.createTransform / H.runTransformAndWaitForSuccess (transform helpers)
 * - H.createDocument's `cards`-carrying variant + a minimal createMockCard
 *   (the shared documents.ts createDocument omits `cards`)
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { WRITABLE_DB_ID } from "./schema-viewer";

/**
 * Port of H.DependencyGraph (e2e-dependency-helpers.ts) — the graph screen's
 * testid-keyed locators. Each takes the Page, mirroring the Cypress chainables.
 */
export const DependencyGraph = {
  graph: (page: Page): Locator => page.getByTestId("dependency-graph"),
  entryButton: (page: Page): Locator => page.getByTestId("graph-entry-button"),
  entrySearchInput: (page: Page): Locator =>
    page.getByTestId("graph-entry-search-input"),
  selectionButton: (page: Page): Locator =>
    page.getByTestId("graph-selection-button"),
  dependencyPanel: (page: Page): Locator =>
    page.getByTestId("graph-dependency-panel"),
};

/**
 * Port of H.waitForBackfillComplete (e2e-dependency-helpers.ts): poll
 * GET /api/ee/dependencies/backfill-status until the async dependency
 * computation has completed, before navigating to the graph.
 */
export async function waitForBackfillComplete(
  api: MetabaseApi,
  timeout = 30_000,
): Promise<void> {
  const interval = 100;
  const deadline = Date.now() + timeout;
  for (;;) {
    const response = await api.get("/api/ee/dependencies/backfill-status");
    const body = (await response.json()) as { complete: boolean };
    if (body.complete) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error("Dependency backfill timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// === transforms (ports of api/createTransform.ts + e2e-transform-helpers.ts) ===

export type TransformDetails = {
  name?: string;
  description?: string | null;
  source: Record<string, unknown>;
  target: Record<string, unknown>;
  tag_ids?: number[];
  collection_id?: number | null;
};

/** Port of H.createTransform (api/createTransform.ts). */
export async function createTransform(
  api: MetabaseApi,
  {
    name = "New transform",
    description = null,
    source,
    target,
    tag_ids,
    collection_id,
  }: TransformDetails,
): Promise<{ id: number }> {
  const response = await api.post("/api/transform", {
    name,
    description,
    source,
    target,
    tag_ids,
    collection_id,
  });
  return (await response.json()) as { id: number };
}

/**
 * Port of H.runTransformAndWaitForSuccess (e2e-transform-helpers.ts):
 * POST /api/transform/:id/run, then poll the run until it reports "succeeded".
 */
export async function runTransformAndWaitForSuccess(
  api: MetabaseApi,
  transformId: number,
  timeout = 30_000,
): Promise<void> {
  const runResponse = await api.post(`/api/transform/${transformId}/run`);
  const { run_id } = (await runResponse.json()) as { run_id: number };

  const interval = 500;
  const deadline = Date.now() + timeout;
  for (;;) {
    const response = await api.get(`/api/transform/run/${run_id}`);
    if (response.status() === 200) {
      const body = (await response.json()) as { status: string };
      if (body.status === "succeeded") {
        return;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error("Transform run did not succeed in time");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// === documents with embedded cards ===

/**
 * Minimal stand-in for createMockCard (metabase-types/api/mocks/card.ts): the
 * /api/document endpoint only reads a handful of fields off each embedded card,
 * so we replicate the mock's full-Card shape locally (the Playwright package
 * doesn't import metabase-types) and let callers override via `opts`.
 */
export function createMockCard(
  opts: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 1,
    entity_id: "12345678901234567890_",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    name: "Question",
    description: "",
    display: "table",
    public_uuid: null,
    dataset_query: { type: "query", query: {}, database: WRITABLE_DB_ID },
    visualization_settings: {},
    result_metadata: [],
    type: "question",
    can_write: true,
    can_restore: false,
    can_delete: false,
    cache_ttl: null,
    collection: null,
    collection_id: null,
    collection_position: null,
    dashboard: null,
    last_query_start: null,
    average_query_time: null,
    based_on_upload: null,
    archived: false,
    enable_embedding: false,
    embedding_params: null,
    initially_published_at: null,
    can_manage_db: true,
    dashboard_id: null,
    dashboard_count: null,
    ...opts,
  };
}

/**
 * Port of H.createDocument (api/createDocument.ts) — the `cards`-carrying
 * variant the shared documents.ts createDocument omits. Sends
 * name/collection_id/document/cards to POST /api/document.
 */
export async function createDocument(
  api: MetabaseApi,
  {
    name,
    collection_id = null,
    document,
    cards,
  }: {
    name: string;
    collection_id?: number | null;
    document: unknown;
    cards?: Record<string, Record<string, unknown>>;
  },
): Promise<{ id: number }> {
  const response = await api.post("/api/document", {
    name,
    collection_id,
    document,
    cards,
  });
  return (await response.json()) as { id: number };
}
