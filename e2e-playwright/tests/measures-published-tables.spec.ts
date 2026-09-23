/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/measures/measures-published-tables.cy.spec.ts
 *
 * The measures pages reached through the *published tables* (library) routes —
 * `/data-studio/library/tables/:tableId/measures[/:id|/new]`. Upstream's own
 * header comment says the bulk of measures functionality is covered by
 * measures-data-studio.cy.spec.ts and that this spec is the published-tables
 * surface plus smoke tests.
 *
 * Port notes:
 * - EE + pro-self-hosted token (H.activateToken in beforeEach). Gated with
 *   `resolveToken` per PORTING rule 7 — the token IS present locally and on CI,
 *   so all 7 tests execute; the gate only guards a token-less environment.
 * - `H.createLibrary()` + `H.publishTables({ table_ids: [ORDERS_ID] })` is
 *   exactly the shared `createLibraryWithTable(api)` helper — reused read-only.
 * - MeasureList / MeasureEditor / createMeasure come from
 *   `support/measures-data-studio.ts` read-only: the published-table pages
 *   render the same `table-measures-page` / `new-measure-page` /
 *   `measure-detail-page` testids, so the locator objects are route-agnostic.
 *   Only the routes and the "Measures" tab are new (support/measures-published-tables.ts).
 * - cy.intercept(...).as + cy.wait → page.waitForResponse registered BEFORE the
 *   triggering click (PORTING rule 2).
 * - `cy.url().should(...)` retried in Cypress → `expect.poll` (never a one-shot
 *   check).
 * - `H.undoToast().should("contain.text", ...)` is a case-sensitive substring →
 *   `toContainText`, with `.first()` for the transient-duplicate-toast gotcha.
 * - No external DB / email / snowplow needed — fully jar-runnable. This spec
 *   asserts nothing snowplow-related, so no capture is installed (and no no-op
 *   stub is needed either: upstream never calls a snowplow helper here).
 */
import type { MetabaseApi } from "../support/api";
import { resolveToken } from "../support/api";
import { createLibraryWithTable } from "../support/data-studio-library";
import {
  tableFieldsTab,
  tableOverviewTab,
  visitTableOverviewPage,
} from "../support/data-studio-tables";
import { expect, test } from "../support/fixtures";
import {
  MeasureEditor,
  MeasureList,
  createMeasure,
  waitForCreateMeasure,
  waitForUpdateMeasure,
} from "../support/measures-data-studio";
import {
  publishedTableMeasuresUrl,
  tableMeasuresTab,
  visitPublishedTableMeasurePage,
  visitPublishedTableMeasuresPage,
} from "../support/measures-published-tables";
import { undoToast } from "../support/metrics";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { modal, popover } from "../support/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const hasToken = Boolean(resolveToken("pro-self-hosted"));

/**
 * Port of the spec-local createTestMeasure. Cypress aliased the new id as
 * `@measureId`; here it is returned directly.
 */
async function createTestMeasure(
  api: MetabaseApi,
  opts: { name?: string; description?: string } = {},
): Promise<number> {
  const { name = "Test Measure", description } = opts;

  const { id } = await createMeasure(api, {
    name,
    description: description ?? null,
    definition: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    },
  });
  return id;
}

test.describe("scenarios > data studio > library > published tables > measures", () => {
  test.skip(!hasToken, "requires a pro-self-hosted token");

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await createLibraryWithTable(mb.api);
  });

  test.describe("Measure list", () => {
    test("should show empty state and navigate to new measure page", async ({
      page,
    }) => {
      await visitPublishedTableMeasuresPage(page, ORDERS_ID);

      await MeasureList.getEmptyState(page).scrollIntoViewIfNeeded();
      await expect(MeasureList.getEmptyState(page)).toBeVisible();

      await MeasureList.getNewMeasureLink(page).scrollIntoViewIfNeeded();
      await MeasureList.getNewMeasureLink(page).click();

      await expect
        .poll(() => page.url())
        .toContain(`${publishedTableMeasuresUrl(ORDERS_ID)}/new`);
    });

    test("should display measures and navigate to edit page", async ({
      page,
      mb,
    }) => {
      const measureId = await createTestMeasure(mb.api, {
        name: "Total Revenue",
      });
      await visitPublishedTableMeasuresPage(page, ORDERS_ID);

      await MeasureList.getMeasure(page, "Total Revenue").click();

      await expect
        .poll(() => page.url())
        .toContain(`${publishedTableMeasuresUrl(ORDERS_ID)}/${measureId}`);
    });

    test("should navigate between Overview, Fields, and Measures tabs", async ({
      page,
    }) => {
      await visitTableOverviewPage(page, ORDERS_ID);

      await expect(tableOverviewTab(page)).toBeVisible();
      await expect(tableFieldsTab(page)).toBeVisible();
      await expect(tableMeasuresTab(page)).toBeVisible();

      await tableMeasuresTab(page).click();
      await expect
        .poll(() => page.url())
        .toContain(publishedTableMeasuresUrl(ORDERS_ID));

      await tableOverviewTab(page).click();
      await expect
        .poll(() => page.url())
        .toContain(`/data-studio/library/tables/${ORDERS_ID}`);
      await expect.poll(() => page.url()).not.toContain("/measures");
    });
  });

  test.describe("Measure creation", () => {
    test("should create a measure and redirect to edit page", async ({
      page,
    }) => {
      await visitPublishedTableMeasuresPage(page, ORDERS_ID);
      await MeasureList.getNewMeasureLink(page).click();

      await MeasureEditor.getNameInput(page).fill("Total Revenue");
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Sum of ...", { exact: true }).click();
      await popover(page).getByText("Total", { exact: true }).click();

      const created = waitForCreateMeasure(page);
      await MeasureEditor.getSaveButton(page).click();
      await created;

      await expect(undoToast(page).first()).toContainText("Measure created");
      await expect
        .poll(() => page.url())
        .toMatch(
          new RegExp(`/data-studio/library/tables/${ORDERS_ID}/measures/\\d+$`),
        );
    });
  });

  test.describe("Breadcrumbs", () => {
    test("should display collection-based breadcrumbs", async ({
      page,
      mb,
    }) => {
      const measureId = await createTestMeasure(mb.api, {
        name: "Breadcrumb Test Measure",
      });
      await visitPublishedTableMeasurePage(page, ORDERS_ID, measureId);

      await expect(
        MeasureEditor.get(page).getByText("Data", { exact: true }),
      ).toBeVisible();
    });

    test("should navigate back to published table measures via breadcrumb", async ({
      page,
      mb,
    }) => {
      const measureId = await createTestMeasure(mb.api, {
        name: "Breadcrumb Nav Test",
      });
      await visitPublishedTableMeasurePage(page, ORDERS_ID, measureId);
      // Gate on the COLLECTION crumb before resolving the table crumb.
      // PublishedTableBreadcrumbs renders `<Link>{table.display_name}</Link>`
      // first and PREPENDS the collection-path links once `useCollectionPath`
      // resolves. The prepended links are keyed by collection id while the
      // table link is positional, so React reuses the existing anchor node: the
      // element a locator already resolved as "Orders" turns into "Data" with
      // href /data-studio/library, and the click navigates there. This is the
      // PORTING "list re-renders under a resolved locator" gotcha; an
      // href-based gate does NOT close it (measured 2 failures in 3) because
      // the href is correct right up until the swap. Cypress's command-queue
      // latency always cleared the window.
      await expect(
        MeasureEditor.get(page).getByText("Data", { exact: true }),
      ).toBeVisible();

      await MeasureEditor.getBreadcrumb(page, "Orders").click();

      await expect
        .poll(() => page.url())
        .toContain(publishedTableMeasuresUrl(ORDERS_ID));
      await expect.poll(() => page.url()).not.toMatch(/measures\/\d+/);
    });
  });

  test.describe("Measure deletion", () => {
    test("should redirect to published table measures list after deletion", async ({
      page,
      mb,
    }) => {
      const measureId = await createTestMeasure(mb.api, {
        name: "Measure to Delete",
      });
      await visitPublishedTableMeasurePage(page, ORDERS_ID, measureId);
      // Same readiness gate as the breadcrumb test — this test also asserts a
      // post-action navigation, which the same early-router window corrupts.
      await expect(MeasureEditor.get(page)).toBeVisible();

      await MeasureEditor.getActionsButton(page).click();
      await popover(page).getByText("Remove measure", { exact: true }).click();
      const removed = waitForUpdateMeasure(page);
      await modal(page)
        .getByRole("button", { name: "Remove", exact: true })
        .click();
      await removed;

      await expect(undoToast(page).first()).toContainText("Measure removed");
      await expect
        .poll(() => page.url())
        .toContain(publishedTableMeasuresUrl(ORDERS_ID));
      await expect.poll(() => page.url()).not.toMatch(/measures\/\d+/);
    });
  });
});
