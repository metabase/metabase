/**
 * Playwright port of
 * e2e/test/scenarios/admin/datamodel/segments.cy.spec.ts
 *
 * Admin > Data model segments: create/edit/retire a segment via the segment
 * editor (filter builder), use it in a query, revision history, x-ray, and the
 * read-only remote-sync (published-table) case.
 *
 * Port notes:
 * - Snowplow helpers → no-op stubs (PORTING rule 6; no snowplow-micro in the
 *   spike harness). The UI flows still run; only the event assertions are
 *   stubbed. The "segment_created" / x-ray tests keep real coverage of the
 *   create/x-ray flows.
 * - cy.intercept(...).as + cy.wait → page.waitForResponse registered before the
 *   triggering action (PORTING rule 2). The triple @metadata wait is a
 *   response-counter poll (trackMetadataRequests).
 * - cy.findByText/findByLabelText string args are EXACT (PORTING rule 1);
 *   cy.contains is case-sensitive substring.
 * - Boolean `readonly` attr: `should("have.attr","readonly")` is a
 *   presence assertion → one-arg toHaveAttribute (PORTING boolean-attr gotcha).
 * - The read-only remote-sync describe needs the pro-self-hosted EE token (the
 *   jar activates it) + a LOCAL file:// git repo (support/remote-sync.ts) — NOT
 *   infra-gated; it runs on the jar with the token. Skipped without the token.
 */
import { resolveToken } from "../support/api";
import {
  assertRevisionHistory,
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  openSegmentRowMenu,
  resetSnowplow,
  segmentListApp,
  segmentRowMenuTrigger,
  trackMetadataRequests,
} from "../support/datamodel-segments";
import { pickEntity } from "../support/dashboard";
import { createSegment } from "../support/filter-bulk";
import { expect, test } from "../support/fixtures";
import { selectFilterOperator } from "../support/joins";
import { summarize } from "../support/nested-questions";
import {
  configureGit,
  setupGitSync,
  teardownGitSync,
  type RemoteSyncRepo,
} from "../support/remote-sync";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { saveQuestion } from "../support/sharing";
import { main, modal, popover } from "../support/ui";

const { ORDERS, ORDERS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

const hasToken = Boolean(resolveToken("pro-self-hosted"));

test.describe("scenarios > admin > datamodel > segments", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await resetSnowplow();
    await mb.signInAsAdmin();
    await page.setViewportSize({ width: 1400, height: 860 });
  });

  test.describe("with no segments", () => {
    test("should have 'Custom expression' in a filter list (metabase#13069)", async ({
      page,
    }) => {
      await page.goto("/admin/datamodel/segments");

      // should initially show no segments in UI
      await expect(
        main(page).getByText(
          "Create segments to add them to the Filter dropdown in the query builder",
          { exact: true },
        ),
      ).toBeVisible();

      await page
        .getByRole("button", { name: "New segment", exact: true })
        .click();

      await page
        .getByTestId("segment-editor")
        .getByText("Select a table", { exact: true })
        .click();
      await pickEntity(page, {
        path: ["Databases", /Sample Database/, "Orders"],
      });

      await expect(
        page.getByTestId("segment-editor").getByText("Orders", { exact: true }),
      ).toBeVisible();

      await page
        .getByTestId("segment-editor")
        .getByText("Add filters to narrow your answer", { exact: true })
        .click();

      // Fails in v0.36.0 and v0.36.3. It exists in v0.35.4
      await expect(
        popover(page).getByText("Custom Expression", { exact: true }),
      ).toBeVisible();
    });

    test("should show no segments", async ({ page }) => {
      await page.goto("/reference/segments");

      await expect(
        main(page).getByText("Segments are interesting subsets of tables", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Learn how to create segments",
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should track segment_created event when saving a new segment", async ({
      page,
    }) => {
      await page.goto("/admin/datamodel/segments");

      await page
        .getByRole("button", { name: "New segment", exact: true })
        .click();

      // verify segment_create_started event was tracked (snowplow stubbed)
      await expectUnstructuredSnowplowEvent({
        event: "segment_create_started",
        triggered_from: "admin_datamodel_segments",
      });

      await page
        .getByTestId("segment-editor")
        .getByText("Select a table", { exact: true })
        .click();

      const getTable = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === `/api/table/${ORDERS_ID}`,
      );
      await pickEntity(page, {
        path: ["Databases", /Sample Database/, "Orders"],
      });
      await getTable;

      // add filter
      await page
        .getByTestId("segment-editor")
        .getByText("Add filters to narrow your answer", { exact: true })
        .click();
      await popover(page).getByText("Total", { exact: true }).click();
      await selectFilterOperator(page, "Greater than");
      await popover(page).getByLabel("Filter value").fill("100");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      // fill in segment name
      await page
        .getByRole("textbox", { name: /Name your segment/i })
        .fill("High Value Orders");

      // fill in description
      await page
        .getByRole("textbox", { name: /Describe your segment/i })
        .fill("Orders with high values");

      // save segment
      const createSegmentResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/segment",
      );
      await page.getByRole("button", { name: /Save/ }).click();
      await createSegmentResponse;

      // verify segment_created event was tracked (snowplow stubbed)
      await expectUnstructuredSnowplowEvent({
        event: "segment_created",
        triggered_from: "admin_datamodel_segments",
        result: "success",
      });
    });
  });

  test.describe("with segment", () => {
    const SEGMENT_NAME = "Orders < 100";
    let segmentId: number;

    test.beforeEach(async ({ mb }) => {
      const segment = await createSegment(mb.api, {
        name: SEGMENT_NAME,
        description: "All orders with a total under $100.",
        definition: {
          type: "query",
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            filter: ["<", ["field", ORDERS.TOTAL, null], 100],
          },
        },
      });
      segmentId = segment.id;
    });

    test("should show the segment fields list and detail view", async ({
      page,
    }) => {
      // In the list
      await page.goto("/reference/segments");

      await page
        .getByTestId("data-reference-list-item")
        .getByText(SEGMENT_NAME, { exact: true })
        .click();

      // Detail view
      await expect(
        main(page).getByText("Description", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "See this segment", exact: true }),
      ).toBeVisible();

      // Segment fields
      await page
        .getByRole("link", { name: /Fields in this segment/ })
        .click();
      await expect(
        page.getByRole("button", { name: "See this segment", exact: true }),
      ).toHaveCount(0);
      await expect(
        main(page).getByText(`Fields in ${SEGMENT_NAME}`, { exact: true }),
      ).toBeVisible();

      const discount = main(page).getByText("Discount", { exact: true });
      await expect(discount).toHaveCount(2);
      await discount.first().scrollIntoViewIfNeeded();
      await expect(discount.first()).toBeVisible();
    });

    test("should not crash when editing field in segment field detail page (metabase#55322)", async ({
      page,
    }) => {
      await page.goto(`/reference/segments/${segmentId}/fields/${ORDERS.TAX}`);

      const edit = page.getByRole("button", { name: /Edit/ });
      await expect(edit).toBeVisible();
      await edit.click();

      await expect(
        page.getByPlaceholder("No description yet", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Something’s gone wrong", { exact: true }),
      ).toHaveCount(0);
    });

    test("should show up in UI list and should show the segment details of a specific id", async ({
      page,
    }) => {
      await page.goto("/admin/datamodel/segments");

      const table = page.getByRole("table");
      await expect(
        table.getByText("Filtered by Total is less than 100", { exact: true }),
      ).toBeVisible();
      await expect(
        table.getByText("Sample Database", { exact: true }),
      ).toBeVisible();
      await expect(table.getByText("Orders", { exact: true })).toBeVisible();

      const link = page.getByRole("link", { name: /Orders < 100/ });
      await expect(link).toBeVisible();
      await link.click();

      const form = page.locator("form");
      await expect(
        form.getByText("Edit Your Segment", { exact: true }),
      ).toBeVisible();
      await expect(
        form.getByText("Sample Database", { exact: true }),
      ).toBeVisible();
      await expect(form.getByText("Orders", { exact: true })).toBeVisible();

      await expect(
        page.getByPlaceholder("Something descriptive but not too long"),
      ).toHaveValue(SEGMENT_NAME);
      await expect(
        page.getByRole("link", { name: "Preview", exact: true }),
      ).toBeVisible();
    });

    test("should see a newly asked question in its questions list", async ({
      page,
    }) => {
      // Ask question
      const metadata = trackMetadataRequests(page);
      await page.goto("/reference/segments/1/questions");
      await expect.poll(() => metadata()).toBeGreaterThanOrEqual(3);

      await expect(main(page)).toContainText(
        `Questions about ${SEGMENT_NAME}`,
      );
      await expect(page.getByRole("status")).toHaveText(
        "Questions about this segment will appear here as they're added",
      );

      await page
        .getByRole("button", { name: "Ask a question", exact: true })
        .click();
      await expect(page.getByTestId("filter-pill")).toHaveText("Orders < 100");
      await expect(
        page.getByTestId("cell-data").filter({ hasText: "37.65" }).first(),
      ).toBeVisible();

      await summarize(page);
      await page
        .getByTestId("sidebar-right")
        .getByRole("button", { name: "Done", exact: true })
        .click();
      await expect(page.getByTestId("scalar-value")).toHaveText("13,005");
      await saveQuestion(page, "Foo");

      // Check list
      const metadata2 = trackMetadataRequests(page);
      await page.goto("/reference/segments/1/questions");
      await expect.poll(() => metadata2()).toBeGreaterThanOrEqual(3);

      await expect(page.getByRole("status")).toHaveCount(0);
      await expect(
        page
          .getByTestId("data-reference-list-item")
          .getByText("Foo", { exact: true }),
      ).toBeVisible();
    });

    test("should update that segment", async ({ page }) => {
      await page.goto("/admin");
      await page
        .getByTestId("admin-navbar-items")
        .getByText("Table Metadata", { exact: true })
        .click();
      await page.getByRole("link", { name: /Segments/ }).click();

      await openSegmentRowMenu(page, SEGMENT_NAME);
      await popover(page).getByText("Edit Segment", { exact: true }).click();

      // update the filter from "< 100" to "> 10"
      await expect.poll(() => page.url()).toMatch(/segment\/1$/);
      await expect(
        page.locator("label").filter({ hasText: "Edit Your Segment" }),
      ).toBeVisible();
      await page
        .getByTestId("filter-pill")
        .filter({ hasText: /Total\s+is less than/ })
        .click();
      await selectFilterOperator(page, "Greater than");
      await popover(page).getByPlaceholder("Enter a number").fill("10");
      await popover(page)
        .getByRole("button", { name: /Update filter/ })
        .click();

      // confirm that the preview updated
      await expect(page.getByTestId("segment-editor")).toContainText(
        "18758 rows",
      );

      // update name and description, set a revision note, and save the update
      await page.locator('[name="name"]').fill("Orders > 10");
      await page
        .locator('[name="description"]')
        .fill("All orders with a total over $10.");
      await page.locator('[name="revision_message"]').fill("time for a change");
      await page
        .getByTestId("field-set-content")
        .getByText("Save changes", { exact: true })
        .click();

      // get redirected to previous page and see the new segment name
      await expect.poll(() => page.url()).toMatch(/datamodel\/segments$/);
      await expect(
        segmentListApp(page).getByText("Orders > 10", { exact: true }),
      ).toBeVisible();

      // clean up
      await openSegmentRowMenu(page, "Orders > 10");
      await popover(page).getByText("Retire Segment", { exact: true }).click();
      await modal(page)
        .getByRole("button", { name: "Retire", exact: true })
        .click();
    });

    test("should show segment revision history (metabase#45577, metabase#45594)", async ({
      page,
      mb,
    }) => {
      await mb.api.put("/api/segment/1", {
        description: "Medium orders",
        revision_message: "Foo",
      });

      // Make sure revisions are displayed properly in /references
      await page.goto("/reference/segments/1/revisions");
      const referenceRevisions = page.getByTestId("segment-revisions");
      await expect(
        referenceRevisions.getByText(`Revision history for ${SEGMENT_NAME}`, {
          exact: true,
        }),
      ).toBeVisible();
      await assertRevisionHistory(referenceRevisions, SEGMENT_NAME);

      // Make sure revisions are displayed properly in admin table metadata
      await page.goto("/admin/datamodel/segments");
      await openSegmentRowMenu(page, SEGMENT_NAME);
      await popover(page)
        .getByText("Revision History", { exact: true })
        .click();

      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/admin/datamodel/segment/1/revisions");

      const adminRevisions = page.getByTestId("segment-revisions");
      // metabase#45594
      await expect(
        adminRevisions.getByRole("heading", {
          name: `Revision History for "${SEGMENT_NAME}"`,
          exact: true,
        }),
      ).toBeVisible();
      await assertRevisionHistory(adminRevisions, SEGMENT_NAME);

      const breadcrumbs = page.getByTestId("breadcrumbs");
      await expect(
        breadcrumbs.getByText("Segment History", { exact: true }),
      ).toBeVisible();
      await breadcrumbs
        .getByRole("link", { name: "Segments", exact: true })
        .click();

      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/admin/datamodel/segments");
      await expect
        .poll(() => new URL(page.url()).search)
        .toBe(`?table=${ORDERS_ID}`);
    });
  });

  test.describe("x-ray", () => {
    test.afterEach(async () => {
      await expectNoBadSnowplowEvents();
    });

    test("should track x-raying a segment", async ({ page, mb }) => {
      await resetSnowplow();
      await mb.restore();
      await mb.signInAsAdmin();
      await enableTracking();

      const { id } = await createSegment(mb.api, {
        name: "Foo",
        description: "All orders with a total under $100.",
        definition: {
          type: "query",
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            filter: ["<", ["field", ORDERS.TOTAL, null], 100],
          },
        },
      });

      await page.goto(`/reference/segments/${id}`);

      const xray1 = page.waitForResponse((response) =>
        new URL(response.url()).pathname.startsWith(
          "/api/automagic-dashboards/",
        ),
      );
      await page
        .getByRole("listitem")
        .filter({ hasText: "X-ray this segment" })
        .click();
      await xray1;

      await expectUnstructuredSnowplowEvent({
        event: "x-ray_clicked",
        event_detail: "segment",
        triggered_from: "data_reference",
      });

      const complementary = page.getByRole("complementary");
      await expect(
        complementary.getByRole("heading", { name: "More X-rays", exact: true }),
      ).toBeVisible();

      const xray2 = page.waitForResponse((response) =>
        new URL(response.url()).pathname.startsWith(
          "/api/automagic-dashboards/",
        ),
      );
      await complementary
        .getByRole("heading", { name: "Compare", exact: true })
        .locator("..")
        .getByText("Compare with entire dataset", { exact: true })
        .click();
      await xray2;

      await expectUnstructuredSnowplowEvent({
        event: "x-ray_clicked",
        event_detail: "compare",
        triggered_from: "suggestion_sidebar",
      });
    });
  });

  test.describe("read-only remote sync", () => {
    test.skip(
      !hasToken,
      "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
    );

    const SEGMENT_IN_ORDERS = "Segment in Orders table (published)";
    const SEGMENT_IN_PEOPLE = "Segment in People table (Unpublished)";

    let repo: RemoteSyncRepo;

    test.beforeEach(async ({ mb }) => {
      await mb.api.activateToken("pro-self-hosted");

      // set up remote sync (local file:// repo — not infra-gated)
      repo = setupGitSync();
      await configureGit(mb.api, repo, "read-only");
      await mb.api.createLibrary();
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });
      // Let's leave PEOPLE_ID unpublished

      // create segments
      await createSegment(mb.api, {
        name: SEGMENT_IN_ORDERS,
        description: "Hey oh",
        definition: {
          type: "query",
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            filter: ["<", ["field", ORDERS.TOTAL, null], 100],
          },
        },
      });

      await createSegment(mb.api, {
        name: SEGMENT_IN_PEOPLE,
        description: "This is a segment in the PEOPLE table",
        definition: {
          type: "query",
          database: 1,
          query: {
            "source-table": PEOPLE_ID,
            filter: [">", ["field", 10, null], 100],
          },
        },
      });
    });

    test.afterEach(() => {
      teardownGitSync(repo);
    });

    test("can't edit published segment from segment list", async ({ page }) => {
      await page.goto("/admin/datamodel/segments");

      // don't show edit or retire menu options
      await segmentRowMenuTrigger(page, SEGMENT_IN_ORDERS).click();
      await expect(
        popover(page).getByText("Edit Segment", { exact: true }),
      ).toHaveCount(0);
      await expect(
        popover(page).getByText("Retire Segment", { exact: true }),
      ).toHaveCount(0);
      await segmentRowMenuTrigger(page, SEGMENT_IN_ORDERS).click(); // Exit menu dropdown

      await segmentRowMenuTrigger(page, SEGMENT_IN_PEOPLE).click();
      // For unpublished segments, the edit menu options are visible
      await expect(
        popover(page).getByText("Edit Segment", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Retire Segment", { exact: true }),
      ).toBeVisible();
    });

    test("can't edit published segment from segment detail page", async ({
      page,
    }) => {
      await page.goto("/admin/datamodel/segment/1");

      await expect(
        page.getByRole("alert", { name: /This segment can't be edited/ }),
      ).toBeVisible();
      // boolean readonly attr → presence assertion (one-arg toHaveAttribute)
      await expect(
        page.getByRole("textbox", { name: "Name Your Segment", exact: true }),
      ).toHaveAttribute("readonly");
      await expect(
        page.getByRole("textbox", {
          name: "Describe Your Segment",
          exact: true,
        }),
      ).toHaveAttribute("readonly");
      await expect(
        page.getByRole("button", { name: /Save changes/ }),
      ).toHaveCount(0);

      // can still edit a segment if table is not published
      await page.goto("/admin/datamodel/segment/2");

      await expect(
        page.getByRole("alert", { name: /This segment can't be edited/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("textbox", { name: "Name Your Segment", exact: true }),
      ).not.toHaveAttribute("readonly");
      await expect(
        page.getByRole("textbox", {
          name: "Describe Your Segment",
          exact: true,
        }),
      ).not.toHaveAttribute("readonly");
      await expect(
        page.getByRole("button", { name: /Save changes/ }),
      ).toBeVisible();
    });
  });
});
