/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/data-model/segments-data-studio.cy.spec.ts
 *
 * Segments management inside the data-studio data-model surface (@EE): list /
 * empty state, creation (with filters, implicit joins, field-value modes),
 * editing, deletion, unsaved-changes guard, dependent segments, revision
 * history, the dependency graph, and read-only access for data analysts.
 *
 * Port notes:
 * - @EE + pro-self-hosted token: activated in beforeEach; the whole describe is
 *   skipped without it (PORTING rule 7). The jar activates it.
 * - Snowplow assertions → no-op stubs (PORTING rule 6; no snowplow-micro in the
 *   spike harness). The UI flows still run; only the event assertions are
 *   stubbed. TODO: wire snowplow-micro to make these real.
 * - cy.intercept(...).as + cy.wait → page.waitForResponse registered before the
 *   triggering action (PORTING rule 2).
 * - cy.findByText/findByLabelText/findByPlaceholderText string args are EXACT
 *   (PORTING rule 1); cy.contains / should("contain") are case-sensitive
 *   substring → toContainText.
 * - findByDisplayValue → the imperative input/textarea scan (getByDisplayValue
 *   is missing from this Playwright install's types) — filters-repros helper.
 * - Toast text assertions use .first() (transient-UI duplicate gotcha).
 * - The Email search combobox is a debounced typeahead → pressSequentially
 *   (PORTING rule 5), not fill.
 * - "Segment cycles" is `it.skip` upstream → test.skip, ported faithfully.
 * - No external DB / email / webhook needed — fully jar-runnable.
 */
import { resolveToken } from "../support/api";
import { openTable } from "../support/ad-hoc-question";
import { DependencyGraph } from "../support/dependency-graph";
import { createSegment } from "../support/filter-bulk";
import { findByDisplayValue } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import { selectFilterOperator } from "../support/joins";
import { undoToast } from "../support/metrics";
import { getNotebookStep, visualize } from "../support/notebook";
import { tableInteractive } from "../support/models";
import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { SAMPLE_DB_SCHEMA_ID } from "../support/data-model";
import {
  SegmentEditor,
  SegmentList,
  SegmentRevisionHistory,
  expectUnstructuredSnowplowEvent,
  getSegmentsBaseUrl,
  resetSnowplow,
  visitDataModelSegment,
  visitDataStudioSegments,
  visitDataStudioTable,
} from "../support/segments-data-studio";
import type { MetabaseApi } from "../support/api";
import { modal, popover } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

/** Port of NODATA_USER_ID (cypress_sample_instance_data.js). */
const NODATA_USER_ID = (() => {
  const user = SAMPLE_INSTANCE_DATA.users.find(
    ({ email }) => email === "nodata@metabase.test",
  );
  if (!user) {
    throw new Error("nodata user not found in cypress_sample_instance_data");
  }
  return user.id;
})();

const hasToken = Boolean(resolveToken("pro-self-hosted"));

// POST /api/segment — the "@createSegment" alias.
function waitForCreateSegment(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/segment",
  );
}

// PUT /api/segment/:id — the "@updateSegment" alias.
function waitForUpdateSegment(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/segment\/\d+$/.test(new URL(response.url()).pathname),
  );
}

// GET /api/table/:id/query_metadata — the "@metadata" alias.
function waitForMetadata(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/table\/\d+\/query_metadata/.test(
        new URL(response.url()).pathname,
      ),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Port of the spec-local createTestSegment. Returns the new segment's id
 * (Cypress aliased it as `@segmentId`; here we return it directly).
 */
async function createTestSegment(
  api: MetabaseApi,
  opts: {
    name?: string;
    description?: string;
    tableId?: number;
    filter?: unknown[];
  } = {},
): Promise<number> {
  const {
    name = "Test Segment",
    description,
    tableId = ORDERS_ID,
    filter = ["<", ["field", ORDERS.TOTAL, null], 100],
  } = opts;

  const { id } = await createSegment(api, {
    name,
    description: description ?? null,
    definition: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": tableId,
        filter,
      },
    },
  });
  return id;
}

/** Port of the spec-local verifySegmentInQueryBuilder. */
async function verifySegmentInQueryBuilder(
  page: import("@playwright/test").Page,
  segmentName: string,
  tableId: number = ORDERS_ID,
) {
  await openTable(page, { table: tableId, mode: "notebook" });
  await getNotebookStep(page, "data")
    .getByRole("button", { name: "Filter", exact: true })
    .click();
  await popover(page).getByText(segmentName, { exact: true }).click();
  await visualize(page);
  await expect(tableInteractive(page)).toBeVisible();
}

/** Port of the spec-local verifySegmentNotInQueryBuilder. */
async function verifySegmentNotInQueryBuilder(
  page: import("@playwright/test").Page,
  segmentName: string,
  tableId: number = ORDERS_ID,
) {
  await openTable(page, { table: tableId, mode: "notebook" });
  await getNotebookStep(page, "data")
    .getByRole("button", { name: "Filter", exact: true })
    .click();
  await expect(
    popover(page).getByText(segmentName, { exact: true }),
  ).toHaveCount(0);
}

test.describe("scenarios > data studio > data model > segments", () => {
  test.skip(
    !hasToken,
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test.describe("Segment list", () => {
    test("should show empty state and navigation when no segments exist", async ({
      page,
    }) => {
      await visitDataStudioSegments(page, ORDERS_ID);

      // verify empty state
      await SegmentList.getEmptyState(page).scrollIntoViewIfNeeded();
      await expect(SegmentList.getEmptyState(page)).toBeVisible();
      await expect(
        SegmentList.get(page).getByText(
          "Create a segment to filter rows in this table.",
          { exact: true },
        ),
      ).toBeVisible();

      // verify new segment link and navigation
      await SegmentList.getNewSegmentLink(page).scrollIntoViewIfNeeded();
      await SegmentList.getNewSegmentLink(page).click();

      await expect
        .poll(() => page.url())
        .toContain(`${getSegmentsBaseUrl(ORDERS_ID)}/new`);
    });

    test("should display segments and allow navigation to edit page", async ({
      page,
      mb,
    }) => {
      const segmentId = await createTestSegment(mb.api, {
        name: "High Value Orders",
        filter: [">", ["field", ORDERS.TOTAL, null], 100],
      });
      await visitDataStudioSegments(page, ORDERS_ID);

      // verify segment in list with filter description
      await SegmentList.getSegment(page, "High Value Orders").scrollIntoViewIfNeeded();
      await expect(
        SegmentList.getSegment(page, "High Value Orders"),
      ).toBeVisible();
      await expect(
        SegmentList.get(page).getByTestId("list-item-description"),
      ).toContainText("Filtered by Total is greater than 100");

      // navigate to edit page
      await SegmentList.getSegment(page, "High Value Orders").click();
      await expect
        .poll(() => page.url())
        .toContain(`${getSegmentsBaseUrl(ORDERS_ID)}/${segmentId}`);
    });

    test("should navigate between Fields and Segments tabs", async ({
      page,
    }) => {
      await visitDataStudioTable(page, ORDERS_ID);

      // verify both tabs visible
      await page.getByRole("tab", { name: /Fields/i }).scrollIntoViewIfNeeded();
      await expect(
        page.getByRole("tab", { name: /Segments/i }),
      ).toBeVisible();

      // navigate to segments tab
      await page.getByRole("tab", { name: /Segments/i }).click();
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toContain(
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments`,
        );
      await SegmentList.getEmptyState(page).scrollIntoViewIfNeeded();
      await expect(SegmentList.getEmptyState(page)).toBeVisible();

      // verify tab selection preserved on refresh
      const metadata = waitForMetadata(page);
      await page.reload();
      await metadata;
      const segmentsTab = page.getByRole("tab", { name: /Segments/i });
      await segmentsTab.scrollIntoViewIfNeeded();
      await expect(segmentsTab).toHaveAttribute("aria-selected", "true");

      // navigate back to fields tab
      await page.getByRole("tab", { name: /Fields/i }).click();
      await expect.poll(() => page.url()).toContain("/field");
    });
  });

  test.describe("Segment creation", () => {
    test("should create a segment with filters and verify across features", async ({
      page,
    }) => {
      await visitDataStudioSegments(page, ORDERS_ID);

      // navigate to new segment page
      await SegmentList.getNewSegmentLink(page).scrollIntoViewIfNeeded();
      await SegmentList.getNewSegmentLink(page).click();

      // verify segment_create_started event was tracked (snowplow stubbed)
      await expectUnstructuredSnowplowEvent({
        event: "segment_create_started",
        triggered_from: "data_studio_segments",
        target_id: ORDERS_ID,
      });

      // fill in segment name
      await SegmentEditor.getNameInput(page).fill("Premium Orders");

      // add filter
      await SegmentEditor.getFilterPlaceholder(page).click();
      await popover(page).getByText("Total", { exact: true }).click();
      await selectFilterOperator(page, "Greater than");
      await popover(page).getByLabel("Filter value").fill("100");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      // verify filter was added
      await expect(
        SegmentEditor.get(page).getByText(/Total is greater than 100/i),
      ).toHaveCount(1);

      // save segment
      const created = waitForCreateSegment(page);
      await SegmentEditor.getSaveButton(page).click();
      await created;

      // verify segment_created event was tracked (snowplow stubbed)
      await expectUnstructuredSnowplowEvent({
        event: "segment_created",
        triggered_from: "data_studio_segments",
        result: "success",
      });

      // verify redirect to edit page and toast
      await expect(undoToast(page).first()).toContainText("Segment created");
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toMatch(
          new RegExp(`${escapeRegExp(getSegmentsBaseUrl(ORDERS_ID))}/\\d+$`),
        );

      // verify segment in query builder
      await verifySegmentInQueryBuilder(page, "Premium Orders");
    });

    test("should add filter and show preview in menu", async ({ page }) => {
      await visitDataStudioSegments(page, PRODUCTS_ID);

      await SegmentList.getNewSegmentLink(page).scrollIntoViewIfNeeded();
      await SegmentList.getNewSegmentLink(page).click();

      await SegmentEditor.getFilterPlaceholder(page).click();
      await popover(page).getByText("Price", { exact: true }).click();
      await selectFilterOperator(page, "Less than");
      await popover(page).getByLabel("Filter value").fill("50");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      // verify filter was added
      await expect(
        SegmentEditor.get(page).getByText(/Price is less than 50/i),
      ).toHaveCount(1);

      // verify preview is available in menu
      await SegmentEditor.getActionsButton(page).click();
      await expect(
        popover(page).getByText("Preview", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("Segment editing", () => {
    test("should display and update existing segment", async ({ page, mb }) => {
      const segmentId = await createTestSegment(mb.api, {
        name: "Test Segment",
        description: "Test description",
      });
      await visitDataModelSegment(page, ORDERS_ID, segmentId);

      // verify existing data displayed
      const nameInput = await findByDisplayValue(
        SegmentEditor.get(page),
        "Test Segment",
      );
      await expect(nameInput).toBeVisible();
      await expect(SegmentEditor.getDescriptionInput(page)).toHaveValue(
        "Test description",
      );

      // update segment name (saves immediately on blur/enter)
      const nameUpdated = waitForUpdateSegment(page);
      await nameInput.click();
      await nameInput.press("End");
      await nameInput.pressSequentially(" Updated");
      await nameInput.press("Enter");
      await nameUpdated;

      // verify toast for name update
      await expect(undoToast(page).first()).toContainText(
        "Segment name updated",
      );

      // update description
      await SegmentEditor.getDescriptionInput(page).fill("Updated description");
      const descUpdated = waitForUpdateSegment(page);
      await SegmentEditor.getSaveButton(page).click();
      await descUpdated;

      // verify updated segment in query builder
      await verifySegmentInQueryBuilder(page, "Test Segment Updated");
    });

    test("should navigate back to segments tab via breadcrumb", async ({
      page,
      mb,
    }) => {
      const segmentId = await createTestSegment(mb.api, {
        name: "Breadcrumb Test Segment",
      });
      await visitDataModelSegment(page, ORDERS_ID, segmentId);

      await SegmentEditor.getBreadcrumb(page, "Orders").click();

      await expect
        .poll(() => new URL(page.url()).pathname)
        .toContain(
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments`,
        );
      const segmentsTab = page.getByRole("tab", { name: /Segments/i });
      await segmentsTab.scrollIntoViewIfNeeded();
      await expect(segmentsTab).toHaveAttribute("aria-selected", "true");
    });
  });

  test.describe("Segment deletion", () => {
    test("should remove segment via more menu", async ({ page, mb }) => {
      const segmentId = await createTestSegment(mb.api, {
        name: "Segment to Delete",
      });
      await visitDataModelSegment(page, ORDERS_ID, segmentId);

      // delete via more menu
      await SegmentEditor.getActionsButton(page).click();
      await popover(page).getByText("Remove segment", { exact: true }).click();
      await modal(page).getByRole("button", { name: "Remove", exact: true }).click();

      // verify redirect to list and removal
      await expect(undoToast(page).first()).toContainText("Segment removed");
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toContain(
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments`,
        );
      await expect(
        SegmentList.get(page).getByText("Segment to Delete", { exact: true }),
      ).toHaveCount(0);

      // verify segment removed from query builder
      await verifySegmentNotInQueryBuilder(page, "Segment to Delete");
    });
  });

  test.describe("Unsaved changes", () => {
    test("should show leave confirmation with unsaved changes", async ({
      page,
    }) => {
      await visitDataStudioSegments(page, ORDERS_ID);

      await SegmentList.getNewSegmentLink(page).scrollIntoViewIfNeeded();
      await SegmentList.getNewSegmentLink(page).click();
      await SegmentEditor.getNameInput(page).fill("Unsaved Segment");

      // attempt to navigate away
      await SegmentEditor.getBreadcrumb(page, "Orders").click();

      // verify confirmation modal
      await expect(
        modal(page).getByText("Discard your changes?", { exact: true }),
      ).toBeVisible();
      await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();

      // verify still on editor
      await expect(
        SegmentEditor.get(page).getByText("Unsaved Segment", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("Segment with implicit joins", () => {
    test("should create a segment with implicit join filter", async ({
      page,
    }) => {
      await visitDataStudioSegments(page, ORDERS_ID);

      // navigate to new segment page
      await SegmentList.getNewSegmentLink(page).scrollIntoViewIfNeeded();
      await SegmentList.getNewSegmentLink(page).click();

      // fill in segment name
      await SegmentEditor.getNameInput(page).fill("Widget Orders");

      // add filter via implicit join
      await SegmentEditor.getFilterPlaceholder(page).click();
      await popover(page).getByText("Product", { exact: true }).click();
      await popover(page).getByText("Category", { exact: true }).click();
      await popover(page).getByText("Widget", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      // verify filter was added and save
      await expect(
        SegmentEditor.get(page).getByText(/Product → Category is Widget/i),
      ).toHaveCount(1);
      const created = waitForCreateSegment(page);
      await SegmentEditor.getSaveButton(page).click();
      await created;

      // verify redirected to edit page with segment name
      await expect(SegmentEditor.get(page)).toBeVisible();
      const nameInput = await findByDisplayValue(
        SegmentEditor.get(page),
        "Widget Orders",
      );
      await expect(nameInput).toBeVisible();

      // verify segment works in query builder
      await verifySegmentInQueryBuilder(page, "Widget Orders");
    });
  });

  test.describe("Segment field values modes", () => {
    test("should display list values when creating segment filter on Category field", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/field/${PRODUCTS.CATEGORY}`, {
        has_field_values: "list",
      });

      await visitDataStudioSegments(page, PRODUCTS_ID);
      await SegmentList.getNewSegmentLink(page).scrollIntoViewIfNeeded();
      await SegmentList.getNewSegmentLink(page).click();

      // open filter picker for Category
      await SegmentEditor.getFilterPlaceholder(page).click();
      await popover(page).getByText("Category", { exact: true }).click();

      // verify list mode UI
      await expect(
        popover(page).getByPlaceholder("Search the list", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Widget", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Gadget", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Gizmo", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Doohickey", { exact: true }),
      ).toBeVisible();
    });

    test("should display search input when creating segment filter on Email field", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/field/${PEOPLE.EMAIL}`, {
        has_field_values: "search",
      });

      await visitDataStudioSegments(page, PEOPLE_ID);
      await SegmentList.getNewSegmentLink(page).scrollIntoViewIfNeeded();
      await SegmentList.getNewSegmentLink(page).click();

      // open filter picker for Email
      await SegmentEditor.getFilterPlaceholder(page).click();
      await popover(page).getByText("Email", { exact: true }).click();

      // verify search mode UI and search for email — debounced typeahead needs
      // real keystrokes (PORTING rule 5)
      const combobox = popover(page).getByRole("combobox");
      await expect(combobox).toBeVisible();
      await combobox.click();
      await combobox.pressSequentially("borer-hudson@yahoo.com");
      await expect(
        page.getByRole("listbox").getByText("borer-hudson@yahoo.com", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should display list values for implicit join field", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/field/${PRODUCTS.CATEGORY}`, {
        has_field_values: "list",
      });

      await visitDataStudioSegments(page, ORDERS_ID);
      await SegmentList.getNewSegmentLink(page).scrollIntoViewIfNeeded();
      await SegmentList.getNewSegmentLink(page).click();

      // fill in segment name
      await SegmentEditor.getNameInput(page).fill("Gadget Orders");

      // open filter picker for Product → Category via implicit join
      await SegmentEditor.getFilterPlaceholder(page).click();
      await popover(page).getByText("Product", { exact: true }).click();
      await popover(page).getByText("Category", { exact: true }).click();

      // verify list values are hydrated for FK table field
      await expect(
        popover(page).getByPlaceholder("Search the list", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Widget", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Gadget", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Gizmo", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Doohickey", { exact: true }),
      ).toBeVisible();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      // verify filter was added and save segment
      await expect(
        SegmentEditor.get(page).getByText(/Product → Category is Gadget/i),
      ).toHaveCount(1);
      const created = waitForCreateSegment(page);
      await SegmentEditor.getSaveButton(page).click();
      await created;

      // verify segment created
      await expect(undoToast(page).first()).toContainText("Segment created");
      const nameInput = await findByDisplayValue(
        SegmentEditor.get(page),
        "Gadget Orders",
      );
      await expect(nameInput).toBeVisible();
    });

    test("should not show segments from FK tables in the filter picker", async ({
      page,
      mb,
    }) => {
      // create segment on Products table
      await createSegment(mb.api, {
        name: "Expensive Products",
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            filter: [">", ["field", PRODUCTS.PRICE, null], 50],
          },
        },
      });

      // navigate to create segment on Orders table
      await visitDataStudioSegments(page, ORDERS_ID);
      await SegmentList.getNewSegmentLink(page).scrollIntoViewIfNeeded();
      await SegmentList.getNewSegmentLink(page).click();

      // open filter picker and expand Product table
      await SegmentEditor.getFilterPlaceholder(page).click();
      await popover(page).getByText("Product", { exact: true }).click();

      // verify Category field is visible but Products segment is not
      await expect(
        popover(page).getByText("Category", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Expensive Products", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("Segment dependencies", () => {
    test("should create and use a segment based on another segment", async ({
      page,
      mb,
    }) => {
      // create base segment
      const baseSegmentId = await createTestSegment(mb.api, {
        name: "High Value Orders",
        filter: [">", ["field", ORDERS.TOTAL, null], 100],
      });

      // create segment based on segment
      await createSegment(mb.api, {
        name: "High Value Recent Orders",
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [
              "and",
              ["segment", baseSegmentId],
              [">", ["field", ORDERS.CREATED_AT, null], "2020-01-01"],
            ],
          },
        },
      });

      // verify both segments appear in query builder
      await verifySegmentInQueryBuilder(page, "High Value Orders");
      await openTable(page, { table: ORDERS_ID, mode: "notebook" });
      await getNotebookStep(page, "data")
        .getByRole("button", { name: "Filter", exact: true })
        .click();
      await expect(
        popover(page).getByText("High Value Recent Orders", { exact: true }),
      ).toBeVisible();

      // verify dependent segment works
      await popover(page)
        .getByText("High Value Recent Orders", { exact: true })
        .click();
      await visualize(page);
      await expect(tableInteractive(page)).toBeVisible();
    });
  });

  test.describe("Segment cycles", () => {
    // it.skip upstream — ported faithfully as test.skip.
    test.skip("should prevent creating segment cycles", async ({ page, mb }) => {
      // create Segment A
      const { id: segmentAId } = await createSegment(mb.api, {
        name: "Segment A",
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [">", ["field", ORDERS.TOTAL, null], 50],
          },
        },
      });

      // create Segment B that depends on A
      await createSegment(mb.api, {
        name: "Segment B",
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: ["segment", segmentAId],
          },
        },
      });

      // edit Segment A via UI and try to add Segment B as filter
      const metadata = waitForMetadata(page);
      await visitDataModelSegment(page, ORDERS_ID, segmentAId);
      await metadata;

      await SegmentEditor.get(page).getByLabel("add").click();
      await popover(page).getByText("Segment B", { exact: true }).click();

      // try to save and verify error
      const updated = waitForUpdateSegment(page);
      await SegmentEditor.getSaveButton(page).click();
      await updated;
      await expect(undoToast(page).first()).toContainText(
        "Unable to save segments with circular dependencies",
      );
    });
  });

  test.describe("Revision history", () => {
    test("should display revision history with changes to name, description, and filter", async ({
      page,
      mb,
    }) => {
      const segmentId = await createTestSegment(mb.api, {
        name: "Original Name",
        description: "Original description",
        filter: ["<", ["field", ORDERS.TOTAL, null], 50],
      });

      // update segment name
      await mb.api.put(`/api/segment/${segmentId}`, {
        name: "Updated Name",
        description: "Original description",
        revision_message: "Updated from Data Studio",
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: ["<", ["field", ORDERS.TOTAL, null], 50],
          },
        },
      });

      // update segment description
      await mb.api.put(`/api/segment/${segmentId}`, {
        name: "Updated Name",
        description: "Updated description",
        revision_message: "Updated from Data Studio",
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: ["<", ["field", ORDERS.TOTAL, null], 50],
          },
        },
      });

      // update segment filter
      await mb.api.put(`/api/segment/${segmentId}`, {
        name: "Updated Name",
        description: "Updated description",
        revision_message: "Updated from Data Studio",
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [">", ["field", ORDERS.TOTAL, null], 100],
          },
        },
      });

      await visitDataModelSegment(page, ORDERS_ID, segmentId);

      // navigate to revision history tab
      await SegmentEditor.getRevisionHistoryTab(page).click();

      // verify URL
      await expect
        .poll(() => page.url())
        .toContain(`${getSegmentsBaseUrl(ORDERS_ID)}/${segmentId}/revisions`);

      // verify revision history entries
      const history = SegmentRevisionHistory.get(page);
      await history.getByText(/created this segment/i).scrollIntoViewIfNeeded();
      await expect(history.getByText(/created this segment/i)).toBeVisible();
      await history
        .getByText("Total is greater than 100", { exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        history.getByText("Total is greater than 100", { exact: true }),
      ).toBeVisible();
      await history
        .getByText(/updated the description/i)
        .scrollIntoViewIfNeeded();
      await expect(
        history.getByText(/updated the description/i),
      ).toBeVisible();
    });
  });

  test.describe("Dependencies", () => {
    test("should display dependency graph for a segment", async ({
      page,
      mb,
    }) => {
      const segmentId = await createTestSegment(mb.api, {
        name: "Dependencies Test Segment",
      });
      await visitDataModelSegment(page, ORDERS_ID, segmentId);

      // navigate to dependencies tab
      await SegmentEditor.getDependenciesTab(page).click();

      // verify URL and dependency graph display
      await expect
        .poll(() => page.url())
        .toContain(`${getSegmentsBaseUrl(ORDERS_ID)}/${segmentId}/dependencies`);
      await expect(DependencyGraph.graph(page)).toBeVisible();
      await expect(
        DependencyGraph.graph(page).getByText("Dependencies Test Segment", {
          exact: true,
        }),
      ).toBeVisible();
    });
  });

  test.describe("Readonly access for data analysts", () => {
    test("should show segments in list but hide New segment button for non-admin", async ({
      page,
      mb,
    }) => {
      await createTestSegment(mb.api, { name: "Readonly Test Segment" });

      await mb.api.put(`/api/user/${NODATA_USER_ID}`, {
        is_data_analyst: true,
      });
      await mb.signIn("nodata");

      // verify segment is visible in list
      await visitDataStudioSegments(page, ORDERS_ID);
      await SegmentList.getSegment(page, "Readonly Test Segment").scrollIntoViewIfNeeded();
      await expect(
        SegmentList.getSegment(page, "Readonly Test Segment"),
      ).toBeVisible();

      // verify New segment button is not visible
      await expect(
        SegmentList.get(page).getByRole("link", { name: /New segment/i }),
      ).toHaveCount(0);

      // verify direct navigation to new segment page is blocked
      await page.goto(
        `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/segments/new`,
      );
      await expect.poll(() => page.url()).toContain("/unauthorized");
    });

    test("should display segment detail in readonly mode for non-admin", async ({
      page,
      mb,
    }) => {
      const segmentId = await createTestSegment(mb.api, {
        name: "Readonly Detail Segment",
        description: "Test description for readonly",
      });

      await mb.api.put(`/api/user/${NODATA_USER_ID}`, {
        is_data_analyst: true,
      });
      await mb.signIn("nodata");

      await visitDataModelSegment(page, ORDERS_ID, segmentId);

      // verify segment name input is disabled
      const nameInput = await findByDisplayValue(
        SegmentEditor.get(page),
        "Readonly Detail Segment",
      );
      await expect(nameInput).toBeDisabled();

      // verify description is displayed as plain text
      await expect(
        SegmentEditor.get(page).getByText("Description", { exact: true }),
      ).toBeVisible();
      await expect(
        SegmentEditor.get(page).getByText("Test description for readonly", {
          exact: true,
        }),
      ).toBeVisible();

      // verify Save button is not visible
      await expect(
        SegmentEditor.get(page).getByRole("button", { name: /Save/i }),
      ).toHaveCount(0);

      // verify Remove segment option is hidden in actions menu
      await SegmentEditor.getActionsButton(page).click();
      await expect(
        popover(page).getByText("Preview", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Remove segment", { exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");

      // verify revision history is still accessible
      await SegmentEditor.getRevisionHistoryTab(page).click();
      const history = SegmentRevisionHistory.get(page);
      await history.getByText(/created this segment/i).scrollIntoViewIfNeeded();
      await expect(history.getByText(/created this segment/i)).toBeVisible();
    });
  });
});
