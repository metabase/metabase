/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/published-tables-segments.cy.spec.ts
 *
 * Segments on a *published* table inside the data-studio library
 * (`/data-studio/library/tables/:tableId/segments`). Smoke coverage of the
 * list/empty state, tab navigation, creation, breadcrumbs and deletion — the
 * bulk of the segments functionality is covered by the already-ported
 * `segments-data-studio` spec, whose SegmentList / SegmentEditor locator
 * surface is reused here read-only (the published-tables pages render the same
 * `table-segments-page` / `new-segment-page` / `segment-detail-page` testids).
 *
 * Port notes:
 * - EE: the beforeEach activates `pro-self-hosted` (library + published tables
 *   are token-gated), so the describe is gated on `resolveToken` per PORTING
 *   rule 7. It resolves locally and on CI, so the tests execute.
 * - No snowplow anywhere in this spec — nothing stubbed, nothing captured.
 * - `cy.intercept(...).as` + `cy.wait` → `page.waitForResponse` registered
 *   BEFORE the triggering action (PORTING rule 2). The `@updateSegment` alias
 *   is what a delete fires (removal is a PUT that archives).
 * - `cy.url().should("include"/"match"/"not.match")` retried in Cypress →
 *   `expect.poll` (PORTING wave-5 gotcha), including the negative forms, so a
 *   transient intermediate URL cannot satisfy them.
 * - `findByText` string args are EXACT (PORTING rule 1).
 * - Toast text assertions use `.first()` (transient-UI duplicate gotcha).
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import { resolveToken } from "../support/api";
import { createSegment } from "../support/filter-bulk";
import { expect, test } from "../support/fixtures";
import { selectFilterOperator } from "../support/joins";
import { undoToast } from "../support/metrics";
import {
  publishedTableSegmentsUrl,
  tableSegmentsTab,
  visitPublishedTableSegmentPage,
  visitPublishedTableSegmentsPage,
} from "../support/published-tables-segments";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { SegmentEditor, SegmentList } from "../support/segments-data-studio";
import {
  tableFieldsTab,
  tableOverviewTab,
  visitTableOverviewPage,
} from "../support/data-studio-tables";
import { modal, popover } from "../support/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const hasToken = Boolean(resolveToken("pro-self-hosted"));

// POST /api/segment — the "@createSegment" alias.
function waitForCreateSegment(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/segment",
  );
}

// PUT /api/segment/:id — the "@updateSegment" alias (removal archives).
function waitForUpdateSegment(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/segment\/\d+$/.test(new URL(response.url()).pathname),
  );
}

/**
 * Port of the spec-local createTestSegment. Cypress aliased the new id as
 * `@segmentId`; here it is returned directly.
 */
async function createTestSegment(
  api: MetabaseApi,
  opts: { name?: string; description?: string } = {},
): Promise<number> {
  const { name = "Test Segment", description } = opts;

  const { id } = await createSegment(api, {
    name,
    description: description ?? null,
    definition: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        filter: ["<", ["field", ORDERS.TOTAL, null], 100],
      },
    },
  });
  return id;
}

// Majority of the segments pages functionality is covered in the
// data-model/segments-data-studio spec. This spec is focused on the published
// tables segments pages functionality while doing some smoke tests.
test.describe("scenarios > data studio > library > published tables > segments", () => {
  test.skip(
    !hasToken,
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.createLibrary();
    await mb.api.publishTables({ table_ids: [ORDERS_ID] });
  });

  test.describe("Segment list", () => {
    test("should show empty state and navigate to new segment page", async ({
      page,
    }) => {
      await visitPublishedTableSegmentsPage(page, ORDERS_ID);

      await SegmentList.getEmptyState(page).scrollIntoViewIfNeeded();
      await expect(SegmentList.getEmptyState(page)).toBeVisible();

      await SegmentList.getNewSegmentLink(page).scrollIntoViewIfNeeded();
      await SegmentList.getNewSegmentLink(page).click();

      await expect
        .poll(() => page.url())
        .toContain(`${publishedTableSegmentsUrl(ORDERS_ID)}/new`);
    });

    test("should display segments and navigate to edit page", async ({
      page,
      mb,
    }) => {
      const segmentId = await createTestSegment(mb.api, {
        name: "High Value Orders",
      });
      await visitPublishedTableSegmentsPage(page, ORDERS_ID);

      await SegmentList.getSegment(page, "High Value Orders").click();

      await expect
        .poll(() => page.url())
        .toContain(`${publishedTableSegmentsUrl(ORDERS_ID)}/${segmentId}`);
    });

    test("should navigate between Overview, Fields, and Segments tabs", async ({
      page,
    }) => {
      await visitTableOverviewPage(page, ORDERS_ID);

      await expect(tableOverviewTab(page)).toBeVisible();
      await expect(tableFieldsTab(page)).toBeVisible();
      await expect(tableSegmentsTab(page)).toBeVisible();

      await tableSegmentsTab(page).click();
      await expect
        .poll(() => page.url())
        .toContain(publishedTableSegmentsUrl(ORDERS_ID));

      await tableOverviewTab(page).click();
      await expect
        .poll(() => page.url())
        .toContain(`/data-studio/library/tables/${ORDERS_ID}`);
      await expect.poll(() => page.url()).not.toContain("/segments");
    });
  });

  test.describe("Segment creation", () => {
    test("should create a segment and redirect to edit page", async ({
      page,
    }) => {
      await visitPublishedTableSegmentsPage(page, ORDERS_ID);
      await SegmentList.getNewSegmentLink(page).click();

      await SegmentEditor.getNameInput(page).fill("Premium Orders");
      await SegmentEditor.getFilterPlaceholder(page).click();
      await popover(page).getByText("Total", { exact: true }).click();
      await selectFilterOperator(page, "Greater than");
      await popover(page).getByLabel("Filter value").fill("100");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      const created = waitForCreateSegment(page);
      await SegmentEditor.getSaveButton(page).click();
      await created;

      await expect(undoToast(page).first()).toContainText("Segment created");
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toMatch(
          new RegExp(`/data-studio/library/tables/${ORDERS_ID}/segments/\\d+$`),
        );
    });
  });

  test.describe("Breadcrumbs", () => {
    test("should display collection-based breadcrumbs", async ({
      page,
      mb,
    }) => {
      const segmentId = await createTestSegment(mb.api, {
        name: "Breadcrumb Test Segment",
      });
      await visitPublishedTableSegmentPage(page, ORDERS_ID, segmentId);

      await expect(
        SegmentEditor.get(page).getByText("Data", { exact: true }),
      ).toBeVisible();
    });

    test("should navigate back to published table segments via breadcrumb", async ({
      page,
      mb,
    }) => {
      const segmentId = await createTestSegment(mb.api, {
        name: "Breadcrumb Nav Test",
      });
      await visitPublishedTableSegmentPage(page, ORDERS_ID, segmentId);

      // The segment page briefly renders the table page's 3-crumb trail before
      // the 4-crumb segment one; React reuses the breadcrumb nodes, so a
      // locator resolved inside that window points at a node that has since
      // become the "Library" anchor and the click navigates to
      // /data-studio/library (PORTING: "a list that re-renders under a
      // resolved locator clicks the WRONG ROW"). Gate on the settled crumb —
      // which is also a real check that the crumb targets the segments list.
      await expect(page.getByTestId("data-studio-breadcrumbs")).toContainText(
        "Breadcrumb Nav Test",
      );
      await expect(SegmentEditor.getBreadcrumb(page, "Orders")).toHaveAttribute(
        "href",
        publishedTableSegmentsUrl(ORDERS_ID),
      );
      await SegmentEditor.getBreadcrumb(page, "Orders").click();

      await expect
        .poll(() => page.url())
        .toContain(publishedTableSegmentsUrl(ORDERS_ID));
      await expect.poll(() => page.url()).not.toMatch(/segments\/\d+/);
    });
  });

  test.describe("Segment deletion", () => {
    test("should redirect to published table segments list after deletion", async ({
      page,
      mb,
    }) => {
      const segmentId = await createTestSegment(mb.api, {
        name: "Segment to Delete",
      });
      await visitPublishedTableSegmentPage(page, ORDERS_ID, segmentId);

      await SegmentEditor.getActionsButton(page).click();
      await popover(page)
        .getByText("Remove segment", { exact: true })
        .click();

      const updated = waitForUpdateSegment(page);
      await modal(page)
        .getByRole("button", { name: "Remove", exact: true })
        .click();
      await updated;

      await expect(undoToast(page).first()).toContainText("Segment removed");
      await expect
        .poll(() => page.url())
        .toContain(publishedTableSegmentsUrl(ORDERS_ID));
      await expect.poll(() => page.url()).not.toMatch(/segments\/\d+/);
    });
  });
});
