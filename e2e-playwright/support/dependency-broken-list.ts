/**
 * Helpers for the dependency-broken-list spec port
 * (e2e/test/scenarios/dependencies/dependency-broken-list.cy.spec.ts).
 *
 * New helpers only — shared support modules are imported read-only, never
 * edited. Everything already ported for the sibling dependency specs is reused:
 * - `DependencyDiagnostics` locators + `waitForUnreferencedEntities` live in
 *   support/dependency-unreferenced-list.ts
 * - `waitForBackfillComplete` / `createTransform` live in support/dependency-graph.ts
 *
 * Genuinely new surface here (all from e2e-dependency-helpers.ts /
 * e2e-transform-helpers.ts, none of which had a Playwright home yet):
 * - `visitBrokenDependencies` — the broken-dependencies list screen.
 * - `BrokenSidebar` — the two sidebar regions only the broken list renders
 *   (Missing columns / Broken dependents).
 * - `waitForBreakingDependencies` — poll the breaking-graph endpoint.
 * - `runTransform` / `waitForTransformRuns` / `deleteTransformTable` — the raw
 *   transform-run helpers (the ported `runTransformAndWaitForSuccess` polls a
 *   single run; this spec asserts over the whole run list instead).
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { DependencyDiagnostics } from "./dependency-unreferenced-list";
import { expect } from "./fixtures";

/**
 * Port of H.DependencyDiagnostics.visitBrokenDependencies
 * (e2e-dependency-helpers.ts). Upstream is a bare `cy.visit`; Cypress's
 * retrying `findByText` then covers the list's async load. Playwright resolves
 * locators once, and a virtualized list that re-renders under a resolved row
 * clicks the wrong row (PORTING: "a list that re-renders under a resolved
 * locator"), so anchor on the response that populates the list.
 */
export async function visitBrokenDependencies(page: Page): Promise<void> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname ===
        "/api/ee/dependencies/graph/breaking",
  );
  await page.goto("/data-studio/dependency-diagnostics/broken");
  await responsePromise;
  await expect(DependencyDiagnostics.list(page)).toBeVisible();
}

/**
 * Port of the two H.DependencyDiagnostics.Sidebar regions the unreferenced-list
 * port didn't need. Kept beside the shared `DependencyDiagnostics.Sidebar`
 * rather than added to it (parallel agents must not edit shared modules) —
 * see the consolidation note in findings-inbox/dependency-broken-list.md.
 */
export const BrokenSidebar = {
  missingColumnsSection: (page: Page): Locator =>
    page.getByRole("region", { name: "Missing columns" }),
  brokenDependentsSection: (page: Page): Locator =>
    page.getByRole("region", { name: "Broken dependents" }),
};

/** Minimal shape of a DependencyNode — enough for the count predicate. */
export type BreakingNode = {
  type: string;
  data: { display_name?: string | null; name?: string | null };
};

/**
 * Port of H.waitForBreakingDependencies (e2e-dependency-helpers.ts): poll
 * GET /api/ee/dependencies/graph/breaking until `filter` is satisfied. The
 * dependency graph is recomputed asynchronously after a transform breaks its
 * target table, so this must settle before the list page fires its load query.
 *
 * `includePersonalCollections` mirrors the broken-list page's own default query
 * (the "Include items in personal collections" toggle is ON by default, so the
 * page requests `include-personal-collections=true`). Without it the endpoint
 * omits entities living in personal collections — e.g. `Test Table-based
 * question` in Bobby Tables's personal collection — so a readiness check that
 * expects them would never settle.
 */
export async function waitForBreakingDependencies(
  api: MetabaseApi,
  filter: (nodes: BreakingNode[]) => boolean,
  { timeout = 30_000, includePersonalCollections = false } = {},
): Promise<void> {
  const url = includePersonalCollections
    ? "/api/ee/dependencies/graph/breaking?include-personal-collections=true"
    : "/api/ee/dependencies/graph/breaking";
  const interval = 100;
  const deadline = Date.now() + timeout;
  for (;;) {
    const response = await api.get(url);
    const body = (await response.json()) as { data: BreakingNode[] };
    if (filter(body.data)) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error("Dependency analysis retry timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/** Port of H.runTransform (e2e-transform-helpers.ts). */
export async function runTransform(
  api: MetabaseApi,
  transformId: number,
): Promise<void> {
  // Generous timeout: the first transform run on a freshly booted backend can
  // pay a cold sqlglot/GraalPy parse (FINDINGS #222), which on a loaded CI shard
  // exceeds the 30s default fetch timeout. This is fixture setup, not a timed
  // assertion, so absorb the cold cost — same rationale as the `restore` helper.
  await api.post(`/api/transform/${transformId}/run`, undefined, {
    timeout: 120_000,
  });
}

export type TransformRun = { id: number; status: string };

/**
 * Port of H.waitForTransformRuns (e2e-transform-helpers.ts): poll
 * GET /api/transform/run until `filter` accepts the run list.
 */
export async function waitForTransformRuns(
  api: MetabaseApi,
  filter: (runs: TransformRun[]) => boolean,
  timeout = 60_000,
): Promise<void> {
  const interval = 100;
  const deadline = Date.now() + timeout;
  for (;;) {
    const response = await api.get("/api/transform/run");
    const body = (await response.json()) as { data: TransformRun[] };
    if (filter(body.data)) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error("Transform runs retry timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/** Port of the spec-local dropTransformTable: DELETE /api/transform/:id/table. */
export async function deleteTransformTable(
  api: MetabaseApi,
  transformId: number,
): Promise<void> {
  // MetabaseApi has no `delete` shorthand — go through fetch().
  await api.fetch("DELETE", `/api/transform/${transformId}/table`);
}
