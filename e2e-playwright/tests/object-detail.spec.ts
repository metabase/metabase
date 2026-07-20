/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-tabular/object_detail.cy.spec.js
 * (7 describes, 26 tests — 2 of them `it.skip` upstream).
 *
 * INFRA TIER
 * ----------
 * MIXED, not "QA DB" wholesale. 20 of the 26 tests run against the plain
 * sample database and need no container at all. The `@external` tag is carried
 * by exactly 6 tests — the four `Object Detail > composite keys (postgres|mysql)`
 * cases and the two `Object Detail > no primary keys (postgres|mysql)` cases —
 * and those DO genuinely need the writable QA containers: they
 * `H.restore("${dialect}-writable")`, `H.resetTestTable` into `writable_db`,
 * and resync WRITABLE_DB_ID. Both snapshots exist (`e2e/snapshots/
 * postgres_writable.sql`, `mysql_writable.sql`) and both containers serve
 * `writable_db` (postgres :5404, mysql :3304), so with PW_QA_DB_ENABLED=1 they
 * really execute rather than being faithful-by-construction skips.
 *
 * Port notes
 * ----------
 * - GATING. The six `@external` tests are gated on PW_QA_DB_ENABLED (rule 6).
 *   There is no `afterEach` to guard (PORTING's gate-off-control trap).
 * - SITE URL. Upstream hardcodes `http://localhost:4000` in the two
 *   "Copy link to this record" assertions. That is Cypress's baseUrl; the slot
 *   harness runs on :410N and re-points `site-url` accordingly, so the port
 *   builds the expected URL from `mb.baseUrl`. Same assertion, harness-correct
 *   origin.
 * - `cy.get('[data-index=N]')` → `[data-index="N"]`: the unquoted numeric
 *   attribute value is valid for Sizzle and throws in `querySelectorAll`.
 *   TableInteractive also renders each row once per horizontal quadrant, so
 *   that selector matches TWO `role="row"` nodes per index in both harnesses.
 *   chai-jquery's `have.css` reads the FIRST element, so those assertions port
 *   with `.first()`; the hover/click paths use the frozen-quadrant copy (the
 *   one carrying `detail-shortcut`) via `getShortcutRow`.
 * - `should("have.attr", "disabled", "disabled")` on the prev/next buttons is
 *   jQuery's boolean-attribute special case (the getter returns the attribute
 *   NAME). Playwright reads the real value, which is `""` → ported as the
 *   one-arg presence form `toHaveAttribute("disabled")`.
 * - `cy.findAllByText(x).should("have.length", 2).and("be.visible")
 *   .and("have.attr","href")` (VIZ-199): `have.length` → `toHaveCount(2)`;
 *   `be.visible` on a multi-element subject is an ANY-of-set assertion
 *   (rule 3); `have.attr` yields the FIRST element's attribute.
 * - `cy.get("@getActions").should("have.callCount", 0)` → a passive
 *   `page.on("request")` counter checked at the end (PORTING).
 *   `cy.wait(["@dataset","@dataset","@dataset"])` → one response counter polled
 *   to `>= 3` (three concurrent `waitForResponse`s on one predicate would all
 *   resolve on the first hit).
 * - `H.tableInteractiveScrollContainer().scrollTo(2000, 14900)` has no
 *   `duration`, so it is a plain jQuery scroll assignment → assign
 *   `scrollLeft`/`scrollTop` directly (`reducedMotion: "reduce"` would swallow a
 *   smooth programmatic scroll anyway).
 * - `H.moveDnDKitElementByAlias(alias, { useMouseEvents: true })` →
 *   `moveDnDKitElementSynthetic` (support/dnd.ts): the viz-settings column list
 *   drives dnd-kit's MouseSensor and the -300px destination is above the
 *   sidebar's scroll fold, where a real mouse press cannot land.
 * - `cy.realMouseMove(x, y)` is ELEMENT-RELATIVE (cypress-real-events), so the
 *   sidebar-toggle test converts to absolute page coordinates off the row's
 *   bounding box. `cy.realClick({x, y})` likewise.
 * - `cy.url().should("match", …)` retries → `expect.poll`. The regex is
 *   transcribed verbatim, upstream's `[1-9]d*` typo included (see
 *   support/object-detail.ts for why it is harmless rather than vacuous).
 * - `cy.icon("warning").should("not.exist")` → `toHaveCount(0)` (the faithful
 *   equivalent of a retrying `should("not.exist")`), anchored behind the
 *   object-detail render so it is not satisfied by an unpainted page.
 * - The two upstream `it.skip`s are ported as `test.skip(...)` declarations,
 *   bodies intact.
 * - `H.getTableId({ name })` is unpinned upstream. The shared `writable_db`
 *   postgres carries ~29 debris tables across 28 foreign schemas (PORTING #85),
 *   so the postgres leg pins `schema: "public"`. MySQL's writable_db has a
 *   single schema, so its lookup stays unpinned.
 * - `H.resyncDatabase({ dbId, tableName })` → the port's `tables: [...]` form;
 *   the bare `{ dbId }` call gates on nothing (PORTING).
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import type { MetabaseApi } from "../support/api";
import {
  openOrdersTable,
  openPeopleTable,
  openProductsTable,
} from "../support/ad-hoc-question";
import { openVizSettingsSidebar, tooltip } from "../support/charts";
import {
  grantClipboardPermissions,
  readClipboard,
} from "../support/dashboard-card-repros";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import { moveDnDKitElementSynthetic } from "../support/dnd";
import {
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { visitModel } from "../support/models";
import { tableHeaderClick } from "../support/notebook";
import {
  COMPOSITE_PK_TABLE,
  NO_PK_TABLE,
  QA_DB_SKIP,
  assertOrderDetailView,
  assertUserDetailView,
  drillFK,
  drillPK,
  getNextObjectDetailButton,
  getObjectDetailShortcut,
  getPreviousObjectDetailButton,
  getRow,
  getShortcutRow,
  objectDetail,
  resetTestTable,
  waitForDataset,
  type WritableDialect,
} from "../support/object-detail";
import { visitQuestionAdhoc } from "../support/permissions";
import { visitPublicDashboard } from "../support/question-saved";
import { browseDatabases } from "../support/question-settings";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  WRITABLE_DB_ID,
  getTableId,
  resyncDatabase,
} from "../support/schema-viewer";
import { visitPublicQuestion } from "../support/sharing";
import { tableInteractiveScrollContainer } from "../support/table-column-settings";
import { icon, modal, popover, visitQuestion } from "../support/ui";
import { openObjectDetail } from "../support/viz-charts-repros";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

const FIRST_ORDER_ID = 9676;
const SECOND_ORDER_ID = 10874;
const THIRD_ORDER_ID = 11246;

const TEST_QUESTION = {
  query: {
    "source-table": ORDERS_ID,
    filter: [
      "and",
      [">", ["field", ORDERS.TOTAL, null], 149],
      [">", ["field", ORDERS.TAX, null], 10],
      ["not-null", ["field", ORDERS.DISCOUNT, null]],
    ],
  },
};

const TEST_PEOPLE_QUESTION = {
  query: {
    "source-table": PEOPLE_ID,
  },
};

/** Port of the spec-local changeSorting(columnName, direction). */
async function changeSorting(
  page: Page,
  columnName: string,
  direction: "asc" | "desc",
) {
  const iconName = direction === "asc" ? "arrow_up" : "arrow_down";
  await tableHeaderClick(page, columnName);
  const dataset = waitForDataset(page);
  await icon(popover(page), iconName).click();
  await dataset;
}

test.describe("scenarios > question > object details", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("shows correct object detail card for questions with joins (metabase#27094)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "14775",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", ORDERS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
      },
    };

    const card = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);

    await drillPK(page, { id: 1 });

    const detail = objectDetail(page);
    await expect(
      detail.getByRole("heading", { name: "Awesome Concrete Shoes", exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByRole("heading", { name: "1", exact: true }),
    ).toBeVisible();
  });

  test("shows correct object detail card for questions with joins after clicking on view details (metabase#39477)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "39477",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", ORDERS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
        limit: 2,
      },
    };

    const card = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);

    // Wait for the table to fully render
    await expect(page.getByTestId("question-row-count")).toHaveText(
      "Showing 2 rows",
    );
    const header = page.getByTestId("table-header");
    await expect(header).toBeVisible();
    await expect(header).toContainText("Subtotal");
    const body = page.getByTestId("table-body");
    await expect(body).toBeVisible();
    await expect(body).toContainText("37.65");
    await expect(body).toContainText("110.93");

    // Check object details for the first row
    await openObjectDetail(page, 0);
    let detail = objectDetail(page);
    await expect(
      detail.getByRole("heading", { name: "Awesome Concrete Shoes", exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByRole("heading", { name: "1", exact: true }),
    ).toBeVisible();
    await expect(detail.getByText("37.65", { exact: true })).toBeVisible();
    await detail.getByLabel("Close", { exact: true }).click();

    // Check object details for the second row
    await openObjectDetail(page, 1);
    detail = objectDetail(page);
    await expect(
      detail.getByRole("heading", { name: "Mediocre Wooden Bench", exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByRole("heading", { name: "2", exact: true }),
    ).toBeVisible();
    await expect(detail.getByText("110.93", { exact: true })).toBeVisible();
  });

  test("applies correct filter (metabase#34070)", async ({ page, mb }) => {
    const questionDetails = {
      name: "34070",
      query: {
        "source-table": PRODUCTS_ID,
        fields: [["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }]],
        joins: [
          {
            fields: [["field", REVIEWS.RATING, { "join-alias": "Products" }]],
            alias: "Products",
            condition: [
              "=",
              ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }],
              [
                "field",
                REVIEWS.PRODUCT_ID,
                { "base-type": "type/BigInteger", "join-alias": "Products" },
              ],
            ],
            "source-table": REVIEWS_ID,
          },
        ],
        limit: 10,
      },
    };

    const card = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);

    const cell = page.getByRole("gridcell", { name: "3", exact: true }).first();
    await expect(cell).toBeVisible();
    await cell.click();

    const dataset = waitForDataset(page);
    await modal(page).getByRole("link", { name: "77 Orders", exact: true }).click();
    // should close the modal when browsing relationships
    await expect(objectDetail(page)).toHaveCount(0);
    await dataset;

    await expect(
      page.getByTestId("qb-filters-panel").getByText("Product ID is 3", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("handles browsing records by PKs", async ({ page, mb }) => {
    const card = await createQuestion(mb.api, TEST_QUESTION);
    await visitQuestion(page, card.id);
    await drillPK(page, { id: FIRST_ORDER_ID });

    await assertOrderDetailView(page, {
      id: FIRST_ORDER_ID,
      heading: String(FIRST_ORDER_ID),
    });
    // jQuery's boolean-attribute getter returns "disabled"; the DOM value is ""
    await expect(getPreviousObjectDetailButton(page)).toHaveAttribute(
      "disabled",
    );

    await getNextObjectDetailButton(page).click();
    await assertOrderDetailView(page, {
      id: SECOND_ORDER_ID,
      heading: String(SECOND_ORDER_ID),
    });

    await getNextObjectDetailButton(page).click();
    await assertOrderDetailView(page, {
      id: THIRD_ORDER_ID,
      heading: String(THIRD_ORDER_ID),
    });
    await expect(getNextObjectDetailButton(page)).toHaveAttribute("disabled");

    await getPreviousObjectDetailButton(page).click();
    await assertOrderDetailView(page, {
      id: SECOND_ORDER_ID,
      heading: String(SECOND_ORDER_ID),
    });

    await getPreviousObjectDetailButton(page).click();
    await assertOrderDetailView(page, {
      id: FIRST_ORDER_ID,
      heading: String(FIRST_ORDER_ID),
    });
  });

  test("calculates a row after both vertical and horizontal scrolling correctly (metabase#51301)", async ({
    page,
  }) => {
    await openPeopleTable(page);
    await tableInteractiveScrollContainer(page).evaluate((el) => {
      el.scrollLeft = 2000;
      el.scrollTop = 14900;
    });
    await openObjectDetail(page, 417);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("418");
    await expect(dialog).toContainText("31942-31950 Oak Ridge Parkway");
    await expect(dialog).toContainText("koss-ella@hotmail.com");
  });

  test("handles browsing records by FKs (metabase#21756)", async ({ page }) => {
    await openOrdersTable(page);

    await drillFK(page, { id: 1 });

    await assertUserDetailView(page, { id: 1, heading: "Hudson Borer" });
    await expect(getPreviousObjectDetailButton(page)).toHaveCount(0);
    await expect(getNextObjectDetailButton(page)).toHaveCount(0);

    // Upstream's cy.wait("@dataset") here is satisfied by whichever dataset
    // response the two history pops produce; the port registers the wait
    // before the navigations that trigger it (rule 2) and additionally anchors
    // on the Orders table being back, which is what the next step needs.
    const dataset = waitForDataset(page);
    await page.goBack();
    await page.goBack();
    await dataset;
    await expect(
      page.getByTestId("table-header").getByText("User ID", { exact: true }).first(),
    ).toBeVisible();

    await changeSorting(page, "User ID", "desc");
    await drillFK(page, { id: 2500 });

    await assertUserDetailView(page, { id: 2500, heading: "Kenny Schmidt" });
    await expect(getPreviousObjectDetailButton(page)).toHaveCount(0);
    await expect(getNextObjectDetailButton(page)).toHaveCount(0);
  });

  // Skipped upstream (it.skip) — body ported verbatim.
  test.skip("handles opening a filtered out record", async ({ page, mb }) => {
    const FILTERED_OUT_ID = 1;

    const card = await createQuestion(mb.api, TEST_QUESTION);
    const cardQuery = page.waitForResponse((response) =>
      /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
    );
    await page.goto(`/question/${card.id}/${FILTERED_OUT_ID}`);
    await cardQuery;
    await expect(
      page.getByRole("dialog").getByText(/We're a little lost/i),
    ).toBeVisible();
  });

  // Skipped upstream (it.skip) — body ported verbatim.
  test.skip("can view details of an out-of-range record", async ({
    page,
    mb,
  }) => {
    // since we only fetch 2000 rows, this ID is out of range
    // and has to be fetched separately
    const OUT_OF_RANGE_ID = 2150;

    const card = await createQuestion(mb.api, TEST_PEOPLE_QUESTION);
    const cardQuery = page.waitForResponse((response) =>
      /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
    );
    await page.goto(`/question/${card.id}/${OUT_OF_RANGE_ID}`);
    await cardQuery;
    await expect(
      objectDetail(page).getByRole("heading", {
        name: "Marcelina Kuhn",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should allow to browse linked entities by FKs (metabase#21757)", async ({
    page,
  }) => {
    await openProductsTable(page);

    await drillPK(page, { id: 5 });

    const detail = objectDetail(page);
    await expect(
      detail.getByRole("link", { name: "4 Reviews", exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByRole("link", { name: "97 Orders", exact: true }),
    ).toBeVisible();
    await detail.getByLabel("Next row", { exact: true }).click();

    await expect(
      detail.getByRole("link", { name: "5 Reviews", exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByRole("link", { name: "88 Orders", exact: true }),
    ).toBeVisible();
    await detail.getByLabel("Next row", { exact: true }).click();

    await expect(
      detail.getByRole("link", { name: "8 Reviews", exact: true }),
    ).toBeVisible();
    const ordersLink = detail.getByRole("link", {
      name: "92 Orders",
      exact: true,
    });
    await expect(ordersLink).toBeVisible();

    const dataset = waitForDataset(page);
    await ordersLink.click();

    // should close the modal when browsing relationships
    await expect(objectDetail(page)).toHaveCount(0);

    await dataset;

    await expect(
      page.getByTestId("qb-filters-panel").getByText("Product ID is 7", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByTestId("view-footer").getByText("Showing 92 rows", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should not offer drill-through on the object detail records (metabase#20560)", async ({
    page,
  }) => {
    await openPeopleTable(page, { limit: 2 });

    await drillPK(page, { id: 2 });
    await expect.poll(() => page.url()).toContain("objectId=2");

    const detail = objectDetail(page);
    await detail
      .getByText("Domenica Williamson", { exact: true })
      .last()
      .click();
    // Popover is blocking the city. If it renders, the click on "Searsboro"
    // will not land and the test will fail. Asserting the popover does not
    // exist would give a false positive.
    await detail.getByText("Searsboro", { exact: true }).click();
  });

  test("should work with non-numeric IDs (metabase#22768)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/field/${PRODUCTS.ID}`, { semantic_type: null });
    await mb.api.put(`/api/field/${PRODUCTS.TITLE}`, {
      semantic_type: "type/PK",
    });

    await openProductsTable(page, { limit: 5 });

    // H.findByTextEnsureVisible = scrollIntoView + assert visible + click
    const cell = page
      .getByTestId("table-root")
      .getByText("Rustic Paper Wallet", { exact: true })
      .first();
    await cell.scrollIntoViewIfNeeded();
    await expect(cell).toBeVisible();
    await cell.click();

    await expect
      .poll(() => new URL(page.url()).search)
      .toBe("?objectId=Rustic%20Paper%20Wallet");
    await expect(objectDetail(page)).toContainText("Rustic Paper Wallet");
  });

  test("should work as a viz display type", async ({ page }) => {
    await visitQuestionAdhoc(page, {
      display: "object",
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              "source-table": PRODUCTS_ID,
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Products" }],
              ],
              alias: "Products",
            },
            {
              fields: "all",
              "source-table": PEOPLE_ID,
              condition: [
                "=",
                ["field", ORDERS.USER_ID, null],
                ["field", PEOPLE.ID, { "join-alias": "People" }],
              ],
              alias: "People",
            },
          ],
        },
        type: "query",
      },
    });

    await expect(objectDetail(page)).toBeVisible();

    // metabase(#29023)
    const peopleName = page.getByText("People → Name", { exact: true }).first();
    await peopleName.scrollIntoViewIfNeeded();
    await expect(peopleName).toBeVisible();
    await expect(page.getByText(/Item 1 of/i).first()).toBeVisible();
  });

  test("should not call GET /api/action endpoint for ad-hoc questions (metabase#50266)", async ({
    page,
  }) => {
    // Passive counter — the port of cy.spy().as("getActions") + have.callCount 0
    let getActionsCallCount = 0;
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        new URL(request.url()).pathname === "/api/action"
      ) {
        getActionsCallCount += 1;
      }
    });
    // cy.wait(["@dataset","@dataset","@dataset"]) → one counter polled to >= 3
    let datasetCount = 0;
    page.on("response", (response) => {
      if (
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset"
      ) {
        datasetCount += 1;
      }
    });

    await page.goto("/");
    await browseDatabases(page).click();
    await page
      .getByRole("heading", { name: "Sample Database", exact: true })
      .click();
    await page.getByRole("heading", { name: "Orders", exact: true }).click();
    await expect.poll(() => datasetCount).toBeGreaterThanOrEqual(1);

    await page.getByTestId("cell-data").nth(11).click();
    await popover(page).getByText("View details", { exact: true }).click();
    // object detail + Orders relationship + Reviews relationship
    await expect.poll(() => datasetCount).toBeGreaterThanOrEqual(4);

    expect(getActionsCallCount).toBe(0);
  });

  test("reset object detail navigation state on query change (metabase#54317)", async ({
    page,
    mb,
  }) => {
    const initialFilter = {
      name: "Filter Orders ID < 15",
      query: {
        "source-table": ORDERS_ID,
        filter: ["and", ["<", ["field", ORDERS.ID, null], 15]],
      },
    };

    // Create the question with the initial filter and visit it
    const card = await createQuestion(mb.api, initialFilter);
    await visitQuestion(page, card.id);

    // Click object display
    await page
      .getByTestId("view-footer")
      .getByText("Visualization", { exact: true })
      .click();

    await expect(page.getByTestId("display-options-sensible")).toBeVisible();
    await icon(page, "document").first().click();

    // Verify "Item 14 of 14" in the pagination footer
    const paginationFooter = page.getByTestId("pagination-footer");
    for (let i = 1; i < 14; i++) {
      await icon(paginationFooter, "chevronright").click();
    }
    await expect(
      paginationFooter.getByText("Item 14 of 14", { exact: true }),
    ).toBeVisible();

    // Apply a new filter for order id < 10
    await page.getByTestId("filters-visibility-control").click();
    await page.getByTestId("filter-pill").click();
    const filterPicker = page.getByTestId("number-filter-picker");
    const filterValue = filterPicker.getByLabel("Filter value", {
      exact: true,
    });
    await filterValue.click();
    await filterValue.fill("");
    await filterValue.press("End");
    await filterValue.pressSequentially("10");
    // Blur before submitting: a real mousedown on the button blurs a focused
    // pill/number input, whose blur handler re-renders the form, and mouseup
    // then lands on a replaced node so no click is ever delivered (PORTING).
    await filterValue.blur();
    await filterPicker
      .getByRole("button", { name: "Update filter", exact: true })
      .click();

    // Verify the pagination footer says "Item 1 of 9"
    await expect(
      page.getByTestId("pagination-footer").getByText("Item 1 of 9", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should respect 'view_as' column settings (VIZ-199)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/field/${REVIEWS.ID}`, {
      settings: {
        view_as: "link",
        link_text: "Link to review {{ID}}",
        link_url: "https://metabase.test?review={{ID}}",
      },
    });

    await visitQuestionAdhoc(page, {
      display: "table",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": REVIEWS_ID },
      },
      visualization_settings: {
        column_settings: {
          [JSON.stringify(["name", "RATING"])]: {
            view_as: "link",
            link_text: "Rating: {{RATING}}",
            link_url: "https://metabase.test?rating={{RATING}}",
          },
        },
      },
    });

    await openObjectDetail(page, 0);

    let detail = objectDetail(page);
    let links = detail.getByText("Link to review 1", { exact: true });
    await expect(links).toHaveCount(2);
    // `be.visible` on a multi-element subject is ANY-of-set (rule 3)
    await expect(links.filter({ visible: true }).first()).toBeVisible();
    // `have.attr` on a multi-element subject reads the FIRST element
    await expect(links.first()).toHaveAttribute(
      "href",
      "https://metabase.test?review=1",
    );

    let rating = detail.getByText("Rating: 5", { exact: true });
    await expect(rating).toBeVisible();
    await expect(rating).toHaveAttribute(
      "href",
      "https://metabase.test?rating=5",
    );

    await page.getByLabel("Next row", { exact: true }).click();

    detail = objectDetail(page);
    links = detail.getByText("Link to review 2", { exact: true });
    await expect(links).toHaveCount(2);
    await expect(links.filter({ visible: true }).first()).toBeVisible();
    await expect(links.first()).toHaveAttribute(
      "href",
      "https://metabase.test?review=2",
    );

    rating = detail.getByText("Rating: 4", { exact: true });
    await expect(rating).toBeVisible();
    await expect(rating).toHaveAttribute(
      "href",
      "https://metabase.test?rating=4",
    );
  });

  test("should support keyboard navigation and opened row highlighting", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      display: "table",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PEOPLE_ID },
      },
    });

    const shortcut = await getObjectDetailShortcut(page, 0);
    await expect(
      icon(shortcut, "sidebar_open").filter({ visible: true }).first(),
    ).toBeVisible();

    // chai-jquery's have.css reads the FIRST element of the subject
    await expect(getRow(page, 0).first()).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await openObjectDetail(page, 0);
    await expect(getRow(page, 0).first()).not.toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(
      objectDetail(page).getByRole("heading", {
        name: "Hudson Borer",
        exact: true,
      }),
    ).toBeVisible();

    // navigates down
    await expect(getRow(page, 1).first()).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await page.keyboard.press("ArrowDown");
    await expect(getRow(page, 1).first()).not.toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(
      objectDetail(page).getByRole("heading", {
        name: "Domenica Williamson",
        exact: true,
      }),
    ).toBeVisible();

    // navigates up
    await expect(getRow(page, 0).first()).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await page.keyboard.press("ArrowUp");
    await expect(getRow(page, 0).first()).not.toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(
      objectDetail(page).getByRole("heading", {
        name: "Hudson Borer",
        exact: true,
      }),
    ).toBeVisible();

    // does not navigate outside of bounds
    await page.keyboard.press("ArrowUp");
    await expect(getRow(page, 0).first()).not.toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(
      objectDetail(page).getByRole("heading", {
        name: "Hudson Borer",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should support toggling the sidebar", async ({ page }) => {
    await visitQuestionAdhoc(page, {
      display: "table",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PEOPLE_ID },
      },
    });

    const shortcut = await getObjectDetailShortcut(page, 0);
    await expect(
      icon(shortcut, "sidebar_open").filter({ visible: true }).first(),
    ).toBeVisible();
    await openObjectDetail(page, 0);

    // realHover does not work behind the modal overlay, so upstream works
    // around it with realMouseMove — which is ELEMENT-relative; convert to
    // absolute page coordinates.
    const row = getShortcutRow(page, 0);
    await expect(row).toBeVisible();
    const rect = await row.boundingBox();
    if (!rect) {
      throw new Error("row 0 has no bounding box");
    }
    const detailShortcutWidth = 24;
    const detailShortcutOffset = 10;
    const x = rect.x + detailShortcutOffset + detailShortcutWidth / 2;
    const y = rect.y + rect.height / 2;

    await page.mouse.move(x, y);
    await expect(
      icon(row.getByTestId("detail-shortcut"), "sidebar_closed")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(tooltip(page).first()).toBeVisible();
    await expect(tooltip(page).first()).toContainText("Hide details");

    // Re-hover before acting: Playwright's real mouse must still be over the
    // hover-gated control when the click lands (PORTING's inverted
    // parked-cursor rule).
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);
    await expect(
      icon(row.getByTestId("detail-shortcut"), "sidebar_open")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(tooltip(page).first()).toBeVisible();
    await expect(tooltip(page).first()).toContainText("View details");
  });

  test("should respect viz settings column order and visibility", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      display: "table",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PEOPLE_ID },
      },
    });

    await openVizSettingsSidebar(page);
    const sidebar = page.getByTestId("sidebar-left");
    await sidebar.getByTestId("Address-hide-button").click();

    const stateItem = sidebar.getByRole("listitem").nth(7);
    await expect(stateItem).toHaveText("State");
    await moveDnDKitElementSynthetic(stateItem, { vertical: -300 });

    await openObjectDetail(page, 0);

    const detail = objectDetail(page);
    // hidden columns are not shown
    await expect(detail.getByText("Address", { exact: true })).toHaveCount(0);

    // viz settings columns order is respected
    const texts = await detail.getByText(/State|Email/).allTextContents();
    expect(texts.indexOf("State")).toBeLessThan(texts.indexOf("Email"));
  });

  test.describe("detail page links - questions", () => {
    test("no primary keys (WRK-900)", async ({ page }) => {
      await visitQuestionAdhoc(page, {
        display: "table",
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PEOPLE_ID,
            fields: [
              ["field", PEOPLE.ADDRESS],
              ["field", PEOPLE.EMAIL],
              ["field", PEOPLE.NAME],
            ],
            limit: 5,
          },
        },
      });

      await openObjectDetail(page, 0);
      const detail = objectDetail(page);
      // The Cypress .within() carries an implicit existence assertion on the
      // testid — anchor on it so the absence checks below cannot pass on an
      // unrendered page.
      await expect(detail).toBeVisible();
      await expect(
        detail.getByLabel("Copy link to this record", { exact: true }),
      ).toHaveCount(0);
      await expect(
        detail.getByLabel("Open in full page", { exact: true }),
      ).toHaveCount(0);

      // should not show relationships when there is no PK (WRK-900)
      await expect(detail.getByText(/is connected to/)).toHaveCount(0);
      await expect(detail.getByRole("link", { name: /Orders/ })).toHaveCount(0);
    });

    test("1 primary key", async ({ page, context, mb }) => {
      await grantClipboardPermissions(context);
      await visitQuestionAdhoc(page, {
        display: "table",
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PEOPLE_ID,
            fields: [
              ["field", PEOPLE.ID],
              ["field", PEOPLE.ADDRESS],
              ["field", PEOPLE.EMAIL],
              ["field", PEOPLE.NAME],
            ],
            limit: 5,
          },
        },
      });

      await openObjectDetail(page, 0);
      const detail = objectDetail(page);
      // Upstream hardcodes http://localhost:4000 (Cypress's baseUrl); slot
      // backends run on :410N, so build it from the harness origin.
      const expectedUrl = `${mb.baseUrl}/table/${PEOPLE_ID}/detail/1`;

      await detail
        .getByLabel("Copy link to this record", { exact: true })
        .click();
      await expect.poll(() => readClipboard(page)).toBe(expectedUrl);

      await detail.getByLabel("Open in full page", { exact: true }).click();
      await expect.poll(() => page.url()).toBe(expectedUrl);
      await expect(
        page.getByRole("heading", { name: "Hudson Borer", exact: true }),
      ).toBeVisible();
    });

    test("2 primary keys", async ({ page }) => {
      await visitQuestionAdhoc(page, {
        display: "table",
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PEOPLE_ID,
            fields: [
              ["field", PEOPLE.ID],
              ["field", PEOPLE.ADDRESS],
              ["field", PEOPLE.EMAIL],
              ["field", PEOPLE.NAME],
            ],
            joins: [
              {
                "source-table": ORDERS_ID,
                fields: [["field", ORDERS.ID]],
                strategy: "left-join",
                alias: "Orders",
                condition: [
                  "=",
                  ["field", PEOPLE.ID],
                  ["field", ORDERS.USER_ID],
                ],
              },
            ],
            limit: 5,
          },
        },
      });

      await openObjectDetail(page, 0);
      const detail = objectDetail(page);
      await expect(detail).toBeVisible();
      await expect(
        detail.getByLabel("Copy link to this record", { exact: true }),
      ).toHaveCount(0);
      await expect(
        detail.getByLabel("Open in full page", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("detail page links - models", () => {
    test("no primary keys (WRK-900)", async ({ page, mb }) => {
      const card = await createQuestion(mb.api, {
        type: "model",
        query: {
          "source-table": PEOPLE_ID,
          fields: [
            ["field", PEOPLE.ADDRESS],
            ["field", PEOPLE.EMAIL],
            ["field", PEOPLE.NAME],
          ],
          limit: 5,
        },
      });
      // H.createQuestion(..., { visitQuestion: true }) routes MODELS to
      // visitModel (POST /api/dataset), not visitQuestion (PORTING).
      await visitModel(page, card.id);

      await openObjectDetail(page, 0);
      const detail = objectDetail(page);
      await expect(detail).toBeVisible();
      await expect(
        detail.getByLabel("Copy link to this record", { exact: true }),
      ).toHaveCount(0);
      await expect(
        detail.getByLabel("Open in full page", { exact: true }),
      ).toHaveCount(0);

      // should not show relationships when there is no PK (WRK-900)
      await expect(detail.getByText(/is connected to/)).toHaveCount(0);
      await expect(detail.getByRole("link", { name: /Orders/ })).toHaveCount(0);
    });

    test("1 primary key", async ({ page, context, mb }) => {
      await grantClipboardPermissions(context);
      const card = await createQuestion(mb.api, {
        type: "model",
        name: "model",
        query: {
          "source-table": PEOPLE_ID,
          fields: [
            ["field", PEOPLE.ID],
            ["field", PEOPLE.ADDRESS],
            ["field", PEOPLE.EMAIL],
            ["field", PEOPLE.NAME],
          ],
          limit: 5,
        },
      });
      const slug = [card.id, card.name].join("-");

      await visitModel(page, card.id);
      await openObjectDetail(page, 0);

      const detail = objectDetail(page);
      const expectedUrl = `${mb.baseUrl}/model/${slug}/detail/1`;

      await detail
        .getByLabel("Copy link to this record", { exact: true })
        .click();
      await expect.poll(() => readClipboard(page)).toBe(expectedUrl);

      await detail.getByLabel("Open in full page", { exact: true }).click();
      await expect.poll(() => page.url()).toBe(expectedUrl);
      await expect(
        page.getByRole("heading", { name: "Hudson Borer", exact: true }),
      ).toBeVisible();
    });

    test("2 primary keys", async ({ page, mb }) => {
      const card = await createQuestion(mb.api, {
        type: "model",
        query: {
          "source-table": PEOPLE_ID,
          fields: [
            ["field", PEOPLE.ID],
            ["field", PEOPLE.ADDRESS],
            ["field", PEOPLE.EMAIL],
            ["field", PEOPLE.NAME],
          ],
          joins: [
            {
              "source-table": ORDERS_ID,
              fields: [["field", ORDERS.ID]],
              strategy: "left-join",
              alias: "Orders",
              condition: ["=", ["field", PEOPLE.ID], ["field", ORDERS.USER_ID]],
            },
          ],
          limit: 5,
        },
      });
      await visitModel(page, card.id);

      await openObjectDetail(page, 0);
      const detail = objectDetail(page);
      await expect(detail).toBeVisible();
      await expect(
        detail.getByLabel("Copy link to this record", { exact: true }),
      ).toHaveCount(0);
      await expect(
        detail.getByLabel("Open in full page", { exact: true }),
      ).toHaveCount(0);
    });
  });
});

for (const dialect of ["postgres", "mysql"] as WritableDialect[]) {
  test.describe(`Object Detail > composite keys (${dialect})`, () => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP);

    const TEST_TABLE = COMPOSITE_PK_TABLE;

    test.beforeEach(async ({ mb }) => {
      await mb.restore(`${dialect}-writable`);
      await resetTestTable({ type: dialect, table: TEST_TABLE });
      await mb.signInAsAdmin();
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: [TEST_TABLE],
      });
    });

    test("can show object detail modal for items with composite keys", async ({
      page,
      mb,
    }) => {
      const tableId = await lookupWritableTableId(mb.api, dialect, TEST_TABLE);
      await visitWritableTable(page, tableId);

      await openObjectDetail(page, 0);

      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "Duck", exact: true }),
      ).toBeVisible();
      await dialog.getByLabel("Next row", { exact: true }).click();
      await expect(
        dialog.getByRole("heading", { name: "Horse", exact: true }),
      ).toBeVisible();
    });

    test("cannot navigate past the end of the list of objects with the keyboard", async ({
      page,
      mb,
    }) => {
      // this bug only manifests on tables without single integer primary keys
      // it is also reproducible on tables with string keys
      const tableId = await lookupWritableTableId(mb.api, dialect, TEST_TABLE);
      await visitWritableTable(page, tableId);

      await openObjectDetail(page, 5);

      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "Rabbit", exact: true }),
      ).toBeVisible();

      await page.keyboard.press("ArrowDown");

      await expect(
        dialog.getByRole("heading", { name: "Rabbit", exact: true }),
      ).toBeVisible();
      await expect(dialog.getByText("Empty", { exact: true })).toHaveCount(0);
    });
  });

  test.describe(`Object Detail > no primary keys (${dialect})`, () => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP);

    const TEST_TABLE = NO_PK_TABLE;

    test.beforeEach(async ({ mb }) => {
      await mb.restore(`${dialect}-writable`);
      await resetTestTable({ type: dialect, table: TEST_TABLE });
      await mb.signInAsAdmin();
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: [TEST_TABLE],
      });
    });

    test("can show object detail modal for items with no primary key", async ({
      page,
      mb,
    }) => {
      const tableId = await lookupWritableTableId(mb.api, dialect, TEST_TABLE);
      await visitWritableTable(page, tableId);

      await openObjectDetail(page, 0);

      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "Duck", exact: true }),
      ).toBeVisible();
      await dialog.getByLabel("Next row", { exact: true }).click();
      await expect(
        dialog.getByRole("heading", { name: "Horse", exact: true }),
      ).toBeVisible();
    });
  });
}

test.describe("Object Detail > public", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("can view a public object detail question", async ({ page, mb }) => {
    const card = await createQuestion(mb.api, {
      ...TEST_QUESTION,
      display: "object",
    });
    await visitPublicQuestion(page, mb, card.id);

    const detail = objectDetail(page);
    await expect(detail).toBeVisible();
    await expect(icon(page, "warning")).toHaveCount(0);

    await expect(detail.getByText("User ID", { exact: true })).toBeVisible();
    await expect(detail.getByText("1283", { exact: true })).toBeVisible();

    await expect(
      page.getByTestId("pagination-footer").getByText("Item 1 of 3", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("can view an object detail question on a public dashboard", async ({
    page,
    mb,
  }) => {
    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: { ...TEST_QUESTION, display: "object" },
    });
    await visitPublicDashboard(page, mb, dashboard_id);

    const detail = objectDetail(page);
    await expect(detail).toBeVisible();
    await expect(icon(page, "warning")).toHaveCount(0);

    await expect(detail.getByText("User ID", { exact: true })).toBeVisible();
    await expect(detail.getByText("1283", { exact: true })).toBeVisible();

    await expect(
      page.getByTestId("pagination-footer").getByText("Item 1 of 3", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("issue 66957", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openOrdersTable(page);
  });

  test("filter header should not hide when opening object details (metabase#66957)", async ({
    page,
  }) => {
    // Upstream scopes to H.tableInteractive(); the port narrows to the header,
    // because react-virtualized also renders a visibility:hidden measurement
    // clone of every header cell (PORTING).
    await page
      .getByTestId("table-header")
      .getByText("Quantity", { exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await popover(page).getByText("2", { exact: true }).first().click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await openObjectDetail(page, 5);

    const filtersPanel = queryBuilderFiltersPanel(page);
    await expect(filtersPanel).toBeVisible();
    await filtersPanel
      .getByText("Quantity is equal to 2", { exact: true })
      .click();

    await popover(page).getByText("3", { exact: true }).first().click();
    await popover(page)
      .getByRole("button", { name: "Update filter", exact: true })
      .click();

    await expect(
      filtersPanel.getByText("Quantity is equal to 2 selections", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

/**
 * `H.getTableId({ name })` is unpinned upstream. The shared writable postgres
 * carries debris tables across 28 foreign schemas (PORTING #85), so the
 * postgres lookup pins `public`; mysql's writable_db has one schema.
 */
function lookupWritableTableId(
  api: MetabaseApi,
  dialect: WritableDialect,
  name: string,
) {
  return getTableId(api, {
    databaseId: WRITABLE_DB_ID,
    name,
    ...(dialect === "postgres" ? { schema: "public" } : {}),
  });
}

/** Port of `cy.visit(`/question#?db=${WRITABLE_DB_ID}&table=${tableId}`)`. */
async function visitWritableTable(page: Page, tableId: number) {
  const dataset = waitForDataset(page);
  await page.goto(`/question#?db=${WRITABLE_DB_ID}&table=${tableId}`);
  await dataset;
}
