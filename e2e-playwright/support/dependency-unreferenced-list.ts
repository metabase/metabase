/**
 * Helpers for the dependency-unreferenced-list spec port
 * (e2e/test/scenarios/dependencies/dependency-unreferenced-list.cy.spec.ts).
 *
 * New helpers only. Everything the dependency-graph port already provides
 * (`waitForBackfillComplete`) is imported read-only from support/dependency-graph.ts
 * — this module never edits that file. The genuinely new surface here:
 * - H.DependencyDiagnostics.* locators for the unreferenced-entities list page
 *   (e2e-dependency-helpers.ts) — list / search / filter / sidebar sections.
 * - H.waitForUnreferencedEntities (e2e-dependency-helpers.ts): poll the
 *   unreferenced endpoint until the async analysis has classified every
 *   expected entity.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";

/** Minimal shape of a DependencyNode (metabase-types/api) — the fields
 * getNodeName reads. Tables carry `display_name`; everything else carries
 * `name`. */
export type DependencyNode = {
  type: string;
  data: { display_name?: string | null; name?: string | null };
};

/**
 * Port of H.DependencyDiagnostics (e2e-dependency-helpers.ts) — the
 * unreferenced-entities list screen's testid/role-keyed locators. Each takes the
 * Page, mirroring the Cypress chainables. `visitUnreferencedEntities` navigates
 * and waits for the list's data request + first render (PORTING rule 2).
 */
export const DependencyDiagnostics = {
  visitUnreferencedEntities: async (page: Page): Promise<void> => {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname ===
          "/api/ee/dependencies/graph/unreferenced",
    );
    await page.goto("/data-studio/dependency-diagnostics/unreferenced");
    await responsePromise;
    await expect(DependencyDiagnostics.list(page)).toBeVisible();
  },
  list: (page: Page): Locator => page.getByTestId("dependency-list"),
  searchInput: (page: Page): Locator =>
    page.getByTestId("dependency-list-search-input"),
  filterButton: (page: Page): Locator =>
    page.getByTestId("dependency-filter-button"),
  sidebar: (page: Page): Locator =>
    page.getByTestId("dependency-list-sidebar"),

  Sidebar: {
    header: (page: Page): Locator =>
      page.getByTestId("dependency-list-sidebar-header"),
    locationSection: (page: Page): Locator =>
      page.getByRole("region", { name: "Location" }),
    infoSection: (page: Page): Locator =>
      page.getByRole("region", { name: "Info" }),
    fieldsSection: (page: Page): Locator =>
      page.getByRole("region", { name: "Fields" }),
  },
};

/** Port of getNodeName (spec-local): tables report display_name, everything
 * else its name. */
export function getNodeName(node: DependencyNode): string | null | undefined {
  if (node.type === "table") {
    return node.data.display_name;
  }
  return "name" in node.data ? node.data.name : undefined;
}

/**
 * Port of H.waitForUnreferencedEntities (e2e-dependency-helpers.ts): poll
 * GET /api/ee/dependencies/graph/unreferenced?include-personal-collections=true
 * until `filter` is satisfied. The dependency graph is recomputed
 * asynchronously (metabase#71037); backfill-status only reports the global
 * one-time backfill flag, so this second poll guarantees the entities the test
 * just created have been classified before the list page fires its single load
 * query.
 */
export async function waitForUnreferencedEntities(
  api: MetabaseApi,
  filter: (nodes: DependencyNode[]) => boolean,
  timeout = 30_000,
): Promise<void> {
  const interval = 100;
  const deadline = Date.now() + timeout;
  for (;;) {
    const response = await api.get(
      "/api/ee/dependencies/graph/unreferenced?include-personal-collections=true",
    );
    const body = (await response.json()) as { data: DependencyNode[] };
    if (filter(body.data)) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error("Unreferenced entities analysis retry timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
