/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/visualizations-charts/visualizations-charts-reproductions.cy.spec.js
 *
 * NOTE ON THE NAME COLLISION: there are TWO upstream files with this basename,
 * a `.cy.spec.js` and a `.cy.spec.ts`, holding entirely disjoint sets of
 * issues. The `.ts` one was ported earlier
 * (tests/visualizations-charts-reproductions.spec.ts + support/viz-charts-repros.ts);
 * this module + tests/viz-charts-reproductions.spec.ts port the `.js` one.
 *
 * Kept in its own module per PORTING rule 9 (parallel agents never edit shared
 * support files). Everything reusable is imported read-only from the existing
 * chart modules; what lives here is either genuinely spec-local or a `H` helper
 * with no shared port yet.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { echartsContainer } from "./charts";
import { visitNativeQuestionAdhoc } from "./charts-extras";
import { adhocQuestionHash, visitQuestionAdhoc } from "./permissions";

export const MONGO_SKIP_REASON =
  "Requires the mongo QA database and its mongo-5 snapshot (set PW_QA_DB_ENABLED)";

/**
 * The spike's `visitQuestionAdhoc` takes a narrow AdhocQuestion literal.
 * `adhocQuestionHash` spreads every key into the URL hash at runtime, so widen
 * it the way viz-charts-repros / line-chart already do — this spec additionally
 * passes `displayIsLocked` (issue 30058) and `name`.
 */
type AdhocWide = Parameters<typeof visitQuestionAdhoc>[1] & {
  name?: string;
  displayIsLocked?: boolean;
  visualization_settings?: Record<string, unknown>;
};

export function visitAdhoc(page: Page, question: AdhocWide) {
  return visitQuestionAdhoc(
    page,
    question as Parameters<typeof visitQuestionAdhoc>[1],
  );
}

export function visitNativeAdhoc(page: Page, question: AdhocWide) {
  return visitNativeQuestionAdhoc(
    page,
    question as Parameters<typeof visitNativeQuestionAdhoc>[1],
  );
}

/**
 * Port of `H.visitQuestionAdhoc(question, { mode: "notebook" })`. The Cypress
 * helper visits `/question/notebook#<hash>` and — critically — registers **no
 * waits at all** in notebook mode (`if (mode !== "notebook" && !skipWaiting)`),
 * because nothing runs until Visualize is clicked. So this is a bare goto, with
 * no anchor — matching upstream exactly. The gate is the following
 * `visualize()`, whose click carries its own actionability wait.
 */
export async function visitAdhocNotebook(page: Page, question: AdhocWide) {
  await page.goto(
    `/question/notebook#${adhocQuestionHash(
      question as Parameters<typeof adhocQuestionHash>[0],
    )}`,
  );
}

/**
 * Port of H.cartesianChartCircles / H.cartesianChartCircle
 * (e2e-visual-tests-helpers.js). The `cartesianChartCircle()` variant appends
 * `.should("be.visible")`, which on a multi-element subject is rule 3's
 * ANY-of-set assertion — call sites here either hover (whose actionability
 * check waits for the same) or assert a count first.
 */
const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";

export function cartesianChartCircles(page: Page): Locator {
  return echartsContainer(page).locator(`path[d="${CIRCLE_PATH}"]`);
}

/**
 * Port of H.testPairedTooltipValues(val1, val2):
 *   cy.contains(val1).closest("td").siblings("td").findByText(val2)
 *
 * `cy.contains` is a case-sensitive SUBSTRING match yielding the first hit
 * (PORTING rule 1's caveat), and `findByText` with a string is exact.
 */
export async function testPairedTooltipValues(
  scope: Locator,
  val1: string,
  val2: string,
) {
  const labelCell = scope
    .locator("td")
    .filter({ hasText: new RegExp(escapeRegExp(val1)) })
    .first();
  // jQuery `.siblings("td")` = every td child of the same parent except the
  // element itself — the xpath sibling axes say exactly that.
  const siblingCells = labelCell.locator(
    "xpath=following-sibling::td | preceding-sibling::td",
  );
  await expect(
    siblingCells.getByText(val2, { exact: true }).first(),
  ).toBeVisible();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Port of the issue-18063 spec-local toggleFieldSelectElement:
 *   cy.get(`[data-field-title="${field}"]`).within(() =>
 *     cy.findByPlaceholderText("Select a field").click())
 *
 * Distinct from support/maps.ts's same-named helper, which targets the
 * `chart-setting-select` testid rather than the placeholder — this spec's map
 * settings render an unset Select whose only handle is the placeholder.
 */
export async function toggleFieldSelectElement(scope: Page | Locator, field: string) {
  await scope
    .locator(`[data-field-title="${field}"]`)
    .getByPlaceholder("Select a field")
    .click();
}

/**
 * The counting side of a `cy.intercept(...).as(alias)` whose only use is
 * `cy.get("@alias.all").should("have.length", n)` or a `cy.spy()` call-count
 * assertion. Registered as a passive `page.on("response")` recorder, per
 * PORTING ("port `cy.get('@alias.all')` as a passive counter").
 */
export function countResponses(
  page: Page,
  predicate: (info: { method: string; pathname: string }) => boolean,
): { get count(): number } {
  let count = 0;
  page.on("response", (response) => {
    const request = response.request();
    if (
      predicate({
        method: request.method(),
        pathname: new URL(response.url()).pathname,
      })
    ) {
      count += 1;
    }
  });
  return {
    get count() {
      return count;
    },
  };
}

/**
 * Port of H.withDatabase's `{ TABLE: { FIELD: id }, TABLE_ID: id }` map
 * (e2e-database-metadata-helpers.ts). The shared `getDatabaseFields`
 * (support/homepage.ts) drops the `<TABLE>_ID` half, which is exactly what the
 * issue-16170 fixture needs.
 */
export async function withDatabase(
  api: MetabaseApi,
  databaseId: number,
): Promise<Record<string, Record<string, number>> & Record<string, number>> {
  const response = await api.get(
    `/api/database/${databaseId}/metadata?include_hidden=true`,
  );
  const body = (await response.json()) as {
    tables?: {
      name: string;
      id: number;
      fields?: { name: string; id: number }[];
    }[];
  };
  const database: Record<string, unknown> = {};
  for (const table of body.tables ?? []) {
    const fields: Record<string, number> = {};
    for (const field of table.fields ?? []) {
      fields[field.name.toUpperCase()] = field.id;
    }
    database[table.name.toUpperCase()] = fields;
    database[`${table.name.toUpperCase()}_ID`] = table.id;
  }
  return database as Record<string, Record<string, number>> &
    Record<string, number>;
}
