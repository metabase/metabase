/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/native/native-database-source.cy.spec.js.
 *
 * Own module per PORTING rule 9 — nothing here edits a shared support file.
 * Everything else the port needs is imported read-only from existing modules
 * (native-editor.ts, native-filters-extras.ts, sharing.ts, embedding-hub.ts,
 * command-palette.ts, model-actions.ts, ui.ts).
 */
import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { popover } from "./ui";

export const QA_DB_SKIP_REASON =
  "Requires the QA Postgres12 / MySQL8 / Mongo containers and their " +
  "postgres-12 / mysql-8 / mongo-5 snapshots (set PW_QA_DB_ENABLED)";

/** cy.findByTestId("native-query-top-bar"). */
export function nativeQueryTopBar(page: Page): Locator {
  return page.getByTestId("native-query-top-bar");
}

/** cy.findByTestId("selected-database"). */
export function selectedDatabase(page: Page): Locator {
  return page.getByTestId("selected-database");
}

/**
 * Port of the spec-local `startNativeQuestion()`.
 *
 * `findByText("New")` is testing-library-exact (rule 1). The second lookup is
 * `findByTextEnsureVisible(/(SQL|Native) query/)` — a regex, so it stays a
 * regex, plus the explicit visibility assertion the `EnsureVisible` variant
 * adds (e2e/support/commands/visibility/findByTextEnsureVisible.ts).
 */
export async function startNativeQuestion(page: Page) {
  await page.goto("/");
  await page
    .getByTestId("app-bar")
    .getByText("New", { exact: true })
    .click();
  const entry = popover(page).getByText(/(SQL|Native) query/);
  await expect(entry).toBeVisible();
  await entry.click();
}

/**
 * Port of the spec-local `startNativeModel()`.
 *
 * The upstream comment is emphatic: "It is extremely important to use the UI
 * flow for these scenarios! Do not change this or replace it with
 * `startNewNativeModel()`" — the persistence behaviour under test is driven by
 * the QB mount, not by the ad-hoc hash URL. Ported literally.
 */
export async function startNativeModel(page: Page) {
  await page.goto("/model/new");
  await page
    .getByRole("heading", { name: "Use a native query", exact: true })
    .click();
}

/**
 * Port of the spec-local `assertNoDatabaseSelected()`.
 *
 * `should("contain", …)` on a single-element subject is plain substring
 * containment → `toContainText` (also case-sensitive and substring). It
 * carries the implicit existence requirement `findByTestId` had, so no extra
 * anchor is needed here.
 */
export async function assertNoDatabaseSelected(page: Page) {
  await expect(selectedDatabase(page)).toHaveCount(0);
  await expect(nativeQueryTopBar(page)).toContainText("Select a database");
}

/** Port of the spec-local `selectDatabase(database)`. */
export async function selectDatabase(page: Page, database: string) {
  await popover(page).getByText(database, { exact: true }).click();
  await expect(selectedDatabase(page)).toHaveText(database);
}

/**
 * Port of the spec-local `assertSelectedDatabase(name)`. Returns the
 * `selected-database` locator — one caller chains `.click()` onto it.
 *
 * DELIBERATE, documented addition: upstream's first assertion is
 * `cy.findByTestId("native-query-top-bar").should("not.contain", …)`, whose
 * `findByTestId` throws when the top bar is absent. Playwright's
 * `not.toContainText` passes vacuously on a missing element, so the anchor is
 * restored explicitly (PORTING: "a Cypress chain carries an implicit existence
 * assertion that a naive port silently drops").
 */
export async function assertSelectedDatabase(
  page: Page,
  name: string,
): Promise<Locator> {
  const topBar = nativeQueryTopBar(page);
  await expect(topBar).toHaveCount(1);
  await expect(topBar).not.toContainText("Select a database");

  const selected = selectedDatabase(page);
  await expect(selected).toHaveText(name);
  return selected;
}

/** Port of the spec-local `enableModelActionsForDatabase(id)`. */
export async function enableModelActionsForDatabase(
  api: MetabaseApi,
  id: number,
) {
  await api.put(`/api/database/${id}`, {
    settings: { "database-enable-actions": true },
  });
}

/**
 * The `@persistDatabase` alias:
 * `cy.intercept("PUT", "/api/setting/last-used-native-database-id")`.
 *
 * Registered where Cypress registers the intercept (the beforeEach) rather
 * than at the `cy.wait` call site, because the PUT is fired by the QB as a
 * side effect of mounting/selecting and can land before the test reaches its
 * wait — the retroactive-`cy.wait` shape PORTING describes. `next()` models
 * one `cy.wait("@persistDatabase")`; `count` models
 * `cy.get("@persistDatabase").should("be.null")`.
 */
export class PersistDatabaseRecorder {
  private readonly responses: Response[] = [];
  private cursor = 0;

  constructor(page: Page) {
    page.on("response", (response: Response) => {
      if (
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname ===
          "/api/setting/last-used-native-database-id"
      ) {
        this.responses.push(response);
      }
    });
  }

  /** One `cy.wait("@persistDatabase")`. */
  async next(timeout = 30_000): Promise<Response> {
    await expect
      .poll(() => this.responses.length, { timeout })
      .toBeGreaterThan(this.cursor);
    return this.responses[this.cursor++];
  }

  /** Total PUTs seen so far — 0 is what `should("be.null")` asserts. */
  get count(): number {
    return this.responses.length;
  }
}
