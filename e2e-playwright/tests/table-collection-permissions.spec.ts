/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/table-collection-permissions.cy.spec.ts
 *
 * Data Studio "published tables": a table published into the Library grants
 * query access to users who have no data permissions at all, and only to the
 * published tables (plus whatever FK remapping drags in). Covers question
 * building, x-rays, field values, FK remapping, sandboxing, blocking,
 * unpublishing, and losing the token.
 *
 * Gated on the EE `pro-self-hosted` token (the CI jar activates it).
 *
 * Port notes:
 * - `H.publishTables` / `H.createLibrary` / `H.activateToken` already exist on
 *   the harness API client (support/api.ts) and are reused verbatim.
 * - `H.blockUserGroupPermissions`, `sandboxProductsOnCategory`,
 *   `popoverByIndex` and `assertQueryPermissionError` are new and live in
 *   support/table-collection-permissions.ts (rule 9 — parallel agents).
 * - `cy.findByText(string)` is an EXACT testing-library match → `{ exact: true }`
 *   everywhere (rule 1). `should("not.exist")` → `toHaveCount(0)`;
 *   `should("exist")` → `toBeAttached()`.
 * - `cy.request` setup calls → `mb.api.post/put` (same session semantics).
 * - `.type("Myrtle")` on a search box → `pressSequentially` (rule 5: the
 *   dropdown is debounce-driven). `.type("{esc}")` → `keyboard.press("Escape")`.
 * - `H.visitQuestionAdhoc(..., { mode: "notebook" })` → `visitQuestionAdhocNotebook`.
 * - `H.saveQuestion(name, { wrapId: true })` → `saveQuestion(page, name)`, which
 *   returns the created card id (the wrapped alias) — ported as a bare save,
 *   NOT `saveQuestionToCollection`, matching upstream.
 * - Table-cell text assertions use `.first()`: the Orders result table renders
 *   the same remapped value on many rows, and the upstream assertion is only
 *   "this value renders" (an any-of, per rule 3).
 */
import { deleteToken } from "../support/admin-extras";
import { resolveToken } from "../support/api";
import { createSegment } from "../support/filter-bulk";
import { expect, test } from "../support/fixtures";
import { visitQuestionAdhocNotebook } from "../support/joins";
import { cartesianChartCircles, undoToast } from "../support/metrics";
import { tableInteractive } from "../support/models";
import {
  assertQueryBuilderRowCount,
  getNotebookStep,
  entityPickerModal,
  tableHeaderClick,
  tableHeaderColumn,
  visualize,
} from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { saveQuestion } from "../support/sharing";
import {
  assertQueryPermissionError,
  blockUserGroupPermissions,
  popoverByIndex,
  sandboxProductsOnCategory,
} from "../support/table-collection-permissions";
import { TablePicker, visitDataModel } from "../support/data-model";
import {
  collectionTable,
  main,
  modal,
  newButton,
  popover,
  sidebarSection,
  visitQuestion,
} from "../support/ui";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS, PEOPLE_ID, REVIEWS } =
  SAMPLE_DATABASE;

/** Mirrors USER_GROUPS (e2e/support/cypress_data.js) — fixed snapshot ids. */
const ALL_USERS_GROUP = 1;
const COLLECTION_GROUP = 5;

const productsQuestionDetails = {
  dataset_query: {
    type: "query" as const,
    database: SAMPLE_DB_ID,
    query: {
      "source-table": PRODUCTS_ID,
    },
  },
};

const productsByTimeQuestionDetails = {
  dataset_query: {
    type: "query" as const,
    database: SAMPLE_DB_ID,
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }]],
    },
  },
};

const peopleQuestionDetails = {
  dataset_query: {
    type: "query" as const,
    database: SAMPLE_DB_ID,
    query: {
      "source-table": PEOPLE_ID,
    },
  },
};

const ordersQuestionDetails = {
  dataset_query: {
    type: "query" as const,
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  },
};

const hasToken = Boolean(resolveToken("pro-self-hosted"));

test.describe("scenarios > data studio > table collection permissions", () => {
  test.skip(
    !hasToken,
    "needs the pro-self-hosted EE token (MB_PRO_SELF_HOSTED_TOKEN)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.createLibrary();
  });

  test.describe("queries", () => {
    test("should create a question based on a published table", async ({
      page,
      mb,
    }) => {
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });

      await mb.signIn("nodata");
      await page.goto("/");
      await newButton(page).click();

      await expect(
        popover(page).getByText("Question", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("SQL query", { exact: true }),
      ).toHaveCount(0);
      await popover(page).getByText("Question", { exact: true }).click();

      await expect(
        popover(page).getByText("Products", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Orders", { exact: true }),
      ).toHaveCount(0);
      await popover(page).getByText("Products", { exact: true }).click();

      await visualize(page);
      await assertQueryBuilderRowCount(page, 200);

      const questionId = await saveQuestion(page, "Test question");
      await visitQuestion(page, questionId);
      await assertQueryBuilderRowCount(page, 200);
    });

    test("should create a question with explicit joins when not all FK tables are published", async ({
      page,
      mb,
    }) => {
      await mb.api.publishTables({ table_ids: [ORDERS_ID, PRODUCTS_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhocNotebook(page, ordersQuestionDetails);
      await getNotebookStep(page, "data")
        .getByRole("button", { name: "Join data" })
        .click();

      await expect(
        popover(page).getByText("Products", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("People", { exact: true }),
      ).toHaveCount(0);
      await popover(page).getByText("Products", { exact: true }).click();

      await getNotebookStep(page, "join")
        .getByRole("button", { name: "Summarize" })
        .click();
      await popover(page).getByText("Count of rows", { exact: true }).click();
      await visualize(page);
      await assertQueryBuilderRowCount(page, 1);

      const questionId = await saveQuestion(page, "Test question");
      await visitQuestion(page, questionId);
      await assertQueryBuilderRowCount(page, 1);
    });

    test("should create a question with implicit joins when not all FK tables are published", async ({
      page,
      mb,
    }) => {
      await mb.api.publishTables({ table_ids: [ORDERS_ID, PRODUCTS_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhocNotebook(page, ordersQuestionDetails);
      await getNotebookStep(page, "data")
        .getByRole("button", { name: "Filter" })
        .click();

      await expect(
        popover(page).getByText("Product", { exact: true }),
      ).toBeAttached();
      await expect(popover(page).getByText("User", { exact: true })).toHaveCount(
        0,
      );
      await popover(page).getByText("Product", { exact: true }).click();
      await popover(page).getByText("Category", { exact: true }).click();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();

      await getNotebookStep(page, "filter")
        .getByRole("button", { name: "Summarize" })
        .click();
      await popover(page).getByText("Count of rows", { exact: true }).click();
      await visualize(page);
      await assertQueryBuilderRowCount(page, 1);

      const questionId = await saveQuestion(page, "Test question");
      await visitQuestion(page, questionId);
      await assertQueryBuilderRowCount(page, 1);
    });

    test("should create a question with a table segment", async ({
      page,
      mb,
    }) => {
      await createSegment(mb.api, {
        name: "ID segment",
        definition: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": PRODUCTS_ID,
            filter: ["=", ["field", PRODUCTS.ID, null], 1],
          },
        },
      });
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhocNotebook(page, productsQuestionDetails);
      await getNotebookStep(page, "data")
        .getByRole("button", { name: "Filter" })
        .click();
      await popover(page).getByText("ID segment", { exact: true }).click();
      await visualize(page);
      await assertQueryBuilderRowCount(page, 1);

      const questionId = await saveQuestion(page, "Test question");
      await visitQuestion(page, questionId);
      await assertQueryBuilderRowCount(page, 1);
    });

    test("should create a question with a table metric", async ({
      page,
      mb,
    }) => {
      await mb.api.createQuestion({
        name: "Count metric",
        type: "metric",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
        },
      });
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhocNotebook(page, productsQuestionDetails);
      await getNotebookStep(page, "data")
        .getByRole("button", { name: "Summarize" })
        .click();
      await popover(page).getByText("Metrics", { exact: true }).click();
      await popover(page).getByText("Count metric", { exact: true }).click();
      await visualize(page);
      await assertQueryBuilderRowCount(page, 1);

      const questionId = await saveQuestion(page, "Test question");
      await visitQuestion(page, questionId);
      await assertQueryBuilderRowCount(page, 1);
    });

    test("should create a question with table and question sources", async ({
      page,
      mb,
    }) => {
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhocNotebook(page, productsQuestionDetails);
      await getNotebookStep(page, "data")
        .getByRole("button", { name: "Join data" })
        .click();
      await popover(page).getByText("Browse all", { exact: true }).click();
      await entityPickerModal(page)
        .getByText("Our analytics", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByText("Orders Model", { exact: true })
        .click();

      await getNotebookStep(page, "join")
        .getByRole("button", { name: "Summarize" })
        .click();
      await popover(page).getByText("Count of rows", { exact: true }).click();
      await visualize(page);
      await assertQueryBuilderRowCount(page, 1);

      const questionId = await saveQuestion(page, "Test question");
      await visitQuestion(page, questionId);
      await assertQueryBuilderRowCount(page, 1);
    });

    test("should be able to drill-thru", async ({ page, mb }) => {
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhoc(page, productsQuestionDetails);
      await tableInteractive(page)
        .getByText("82.75", { exact: true })
        .first()
        .click();
      await popover(page).getByText("=", { exact: true }).click();
      await assertQueryBuilderRowCount(page, 1);
    });
  });

  test.describe("x-rays", () => {
    test("should be able to x-ray a table", async ({ page, mb }) => {
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhoc(page, productsByTimeQuestionDetails);
      await cartesianChartCircles(page).first().click();
      await popover(page)
        .getByText("Automatic insights…", { exact: true })
        .click();
      await popover(page).getByText("X-ray", { exact: true }).click();
      await expect(
        main(page).getByText(/A closer look at number of Products/),
      ).toBeVisible();
    });
  });

  test.describe("field values", () => {
    test("should be able to use list field values", async ({ page, mb }) => {
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhoc(page, productsQuestionDetails);
      await tableHeaderClick(page, "Category");
      await popover(page)
        .getByText("Filter by this column", { exact: true })
        .click();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await assertQueryBuilderRowCount(page, 53);
    });

    test("should be able to use search field values", async ({ page, mb }) => {
      await mb.api.publishTables({ table_ids: [PEOPLE_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhoc(page, peopleQuestionDetails);
      await tableHeaderClick(page, "Name");
      await popover(page)
        .getByText("Filter by this column", { exact: true })
        .click();

      await (await popoverByIndex(page, 1))
        .getByText("Aaron Hand", { exact: true })
        .click();
      await (await popoverByIndex(page, 0))
        .getByPlaceholder("Search by Name", { exact: true })
        .pressSequentially("Myrtle");
      await (await popoverByIndex(page, 1))
        .getByText("Myrtle Johns", { exact: true })
        .click();
      await (await popoverByIndex(page, 0))
        .getByPlaceholder("Search by Name", { exact: true })
        .press("Escape");

      await expect(
        popover(page).getByText("Aaron Hand", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Myrtle Johns", { exact: true }),
      ).toBeVisible();
      // Blur the still-focused search box before submitting. Playwright's
      // real mousedown on "Add filter" blurs the pills input, whose blur
      // handler re-renders the picker form — mouseup then lands on a
      // replaced node, so no `click` event ever reaches the button and the
      // filter is silently never applied (verified: force-click fails too,
      // dispatchEvent("click") succeeds). Cypress never hit this because its
      // `.click()` dispatches the whole sequence at the element.
      await popover(page)
        .getByPlaceholder("Search by Name", { exact: true })
        .blur();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await assertQueryBuilderRowCount(page, 2);
    });
  });

  test.describe("remapping", () => {
    test("should automatically publish all tables referenced by FK remapping, recursively", async ({
      page,
      mb,
    }) => {
      await mb.api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
        name: "Product ID",
        type: "external",
        human_readable_field_id: PRODUCTS.TITLE,
      });
      await mb.api.put(`/api/field/${PRODUCTS.RATING}`, {
        semantic_type: "type/FK",
        fk_target_field_id: REVIEWS.ID,
      });
      await mb.api.post(`/api/field/${PRODUCTS.RATING}/dimension`, {
        name: "Rating",
        type: "external",
        human_readable_field_id: REVIEWS.REVIEWER,
      });

      await visitDataModel(page, "data studio");
      await TablePicker.getTable(page, "Orders").click();
      await page.getByRole("button", { name: /Publish/ }).click();

      await expect(
        modal(page).getByText("Products", { exact: true }),
      ).toBeVisible();
      await expect(
        modal(page).getByText("Reviews", { exact: true }),
      ).toBeVisible();
      await expect(modal(page).getByText("People", { exact: true })).toHaveCount(
        0,
      );
      await modal(page)
        .getByText("Publish these tables", { exact: true })
        .click();
      await expect(
        undoToast(page).getByText("Published", { exact: true }),
      ).toBeVisible();

      await mb.signIn("nodata");
      await page.goto("/");
      await sidebarSection(page, "Library")
        .getByText("Data", { exact: true })
        .click();
      await expect(
        collectionTable(page).getByText("Products", { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText("Reviews", { exact: true }),
      ).toBeVisible();
      await collectionTable(page).getByText("Orders", { exact: true }).click();

      await expect(tableInteractive(page)).toBeVisible();
      await expect(tableHeaderColumn(page, "Product ID")).toBeVisible();
    });

    test("should automatically unpublish all tables referenced by FK remapping, recursively", async ({
      page,
      mb,
    }) => {
      await mb.api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
        name: "Product ID",
        type: "external",
        human_readable_field_id: PRODUCTS.TITLE,
      });
      await mb.api.put(`/api/field/${PRODUCTS.RATING}`, {
        semantic_type: "type/FK",
        fk_target_field_id: REVIEWS.ID,
      });
      await mb.api.post(`/api/field/${PRODUCTS.RATING}/dimension`, {
        name: "Rating",
        type: "external",
        human_readable_field_id: REVIEWS.REVIEWER,
      });
      await mb.api.publishTables({ table_ids: [ORDERS_ID, PEOPLE_ID] });

      await visitDataModel(page, "data studio");
      await TablePicker.getTable(page, "Reviews").click();
      await page.getByRole("button", { name: /Unpublish/ }).click();

      await expect(
        modal(page).getByText("Products", { exact: true }),
      ).toBeVisible();
      await expect(
        modal(page).getByText("Orders", { exact: true }),
      ).toBeVisible();
      await expect(modal(page).getByText("People", { exact: true })).toHaveCount(
        0,
      );
      await modal(page)
        .getByText("Unpublish these tables", { exact: true })
        .click();
      await expect(
        undoToast(page).getByText("Unpublished", { exact: true }),
      ).toBeVisible();

      await mb.signIn("nodata");
      await page.goto("/");
      await sidebarSection(page, "Library")
        .getByText("Data", { exact: true })
        .click();
      await expect(
        collectionTable(page).getByText("People", { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText("Products", { exact: true }),
      ).toHaveCount(0);
      await expect(
        collectionTable(page).getByText("Orders", { exact: true }),
      ).toHaveCount(0);
      await expect(
        collectionTable(page).getByText("Reviews", { exact: true }),
      ).toHaveCount(0);
    });

    test("should be able to use list field values with FK remapping", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/field/${ORDERS.PRODUCT_ID}`, {
        has_field_values: "list",
      });
      await mb.api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
        name: "Product ID",
        type: "external",
        human_readable_field_id: PRODUCTS.TITLE,
      });
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhoc(page, ordersQuestionDetails);
      await expect(
        tableInteractive(page)
          .getByText("Awesome Concrete Shoes", { exact: true })
          .first(),
      ).toBeVisible();

      await tableHeaderClick(page, "Product ID");
      await popover(page)
        .getByText("Filter by this column", { exact: true })
        .click();
      await popover(page)
        .getByText("Rustic Paper Wallet", { exact: true })
        .click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await assertQueryBuilderRowCount(page, 93);
    });

    test("should be able to use search field values with FK remapping", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/field/${ORDERS.PRODUCT_ID}`, {
        has_field_values: "search",
      });
      await mb.api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
        name: "Product ID",
        type: "external",
        human_readable_field_id: PRODUCTS.TITLE,
      });
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhoc(page, ordersQuestionDetails);
      await expect(
        tableInteractive(page)
          .getByText("Awesome Concrete Shoes", { exact: true })
          .first(),
      ).toBeVisible();

      await tableHeaderClick(page, "Product ID");
      await popover(page)
        .getByText("Filter by this column", { exact: true })
        .click();
      await popover(page)
        .getByPlaceholder("Search by Title or enter an ID", { exact: true })
        .pressSequentially("Rustic Paper");
      await popover(page)
        .getByText("Rustic Paper Wallet", { exact: true })
        .click();
      // See the "search field values" test: blur the search box before
      // submitting, or the mousedown-induced re-render swallows the click.
      await popover(page)
        .getByPlaceholder("Search by Title or enter an ID", { exact: true })
        .blur();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await assertQueryBuilderRowCount(page, 93);
    });

    test("should show a permission error when accessing a published table when some columns are remapped to unpublished tables", async ({
      page,
      mb,
    }) => {
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });
      await mb.api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
        name: "Product ID",
        type: "external",
        human_readable_field_id: PRODUCTS.TITLE,
      });

      await mb.signIn("nodata");
      await visitQuestionAdhoc(page, ordersQuestionDetails);
      await assertQueryPermissionError(page);
    });
  });

  test.describe("sandboxing", () => {
    test("should be able to access a published sandboxed table", async ({
      page,
      mb,
    }) => {
      await blockUserGroupPermissions(mb.api, ALL_USERS_GROUP);
      await sandboxProductsOnCategory(mb.api);
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });

      await mb.signIn("sandboxed");
      await visitQuestionAdhoc(page, productsQuestionDetails);
      await assertQueryBuilderRowCount(page, 54);
    });

    test("should be able to use list field values with sandboxing", async ({
      page,
      mb,
    }) => {
      await blockUserGroupPermissions(mb.api, ALL_USERS_GROUP);
      await sandboxProductsOnCategory(mb.api);
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });

      await mb.signIn("sandboxed");
      await visitQuestionAdhoc(page, productsQuestionDetails);
      await tableHeaderClick(page, "Category");
      await popover(page)
        .getByText("Filter by this column", { exact: true })
        .click();
      await expect(
        popover(page).getByText("Widget", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Gadget", { exact: true }),
      ).toHaveCount(0);
      await popover(page).getByText("Widget", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await assertQueryBuilderRowCount(page, 54);
    });

    test("should be able to use search field values with sandboxing", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/field/${PRODUCTS.CATEGORY}`, {
        has_field_values: "search",
      });
      await blockUserGroupPermissions(mb.api, ALL_USERS_GROUP);
      await sandboxProductsOnCategory(mb.api);
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });

      await mb.signIn("sandboxed");
      await visitQuestionAdhoc(page, productsQuestionDetails);
      await tableHeaderClick(page, "Category");
      await popover(page)
        .getByText("Filter by this column", { exact: true })
        .click();
      await popover(page)
        .getByPlaceholder("Search by Category", { exact: true })
        .pressSequentially("get");
      await expect(
        popover(page).getByText("Widget", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Gadget", { exact: true }),
      ).toHaveCount(0);
      await popover(page).getByText("Widget", { exact: true }).click();
      // See the "search field values" test: blur the search box before
      // submitting, or the mousedown-induced re-render swallows the click.
      await popover(page)
        .getByPlaceholder("Search by Category", { exact: true })
        .blur();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await assertQueryBuilderRowCount(page, 54);
    });
  });

  test.describe("block permission", () => {
    test("should not be able to access a published table data when blocked", async ({
      page,
      mb,
    }) => {
      await blockUserGroupPermissions(mb.api, ALL_USERS_GROUP);
      await blockUserGroupPermissions(mb.api, COLLECTION_GROUP);
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });

      await mb.signIn("nodata");
      await visitQuestionAdhoc(page, productsQuestionDetails);
      await assertQueryPermissionError(page);
    });
  });

  test.describe("unpublishing", () => {
    test("should not be able to access a previously published table when it is unpublished", async ({
      page,
      mb,
    }) => {
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });
      await visitDataModel(page, "data studio");
      await TablePicker.getTable(page, "Products").click();
      await page.getByRole("button", { name: /Unpublish/ }).click();
      await modal(page)
        .getByText("Unpublish this table", { exact: true })
        .click();
      await expect(
        undoToast(page).getByText("Unpublished", { exact: true }),
      ).toBeVisible();

      await mb.signIn("nodata");
      await visitQuestionAdhoc(page, productsQuestionDetails);
      await assertQueryPermissionError(page);
    });

    test("should not be able to create questions when all published tables are unpublished", async ({
      page,
      mb,
    }) => {
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });
      await visitDataModel(page, "data studio");
      await TablePicker.getTable(page, "Products").click();
      await page.getByRole("button", { name: /Unpublish/ }).click();
      await modal(page)
        .getByText("Unpublish this table", { exact: true })
        .click();
      await expect(
        undoToast(page).getByText("Unpublished", { exact: true }),
      ).toBeVisible();

      await mb.signIn("nodata");
      await page.goto("/");
      await newButton(page).click();
      await expect(
        popover(page).getByText("Dashboard", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Question", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("losing token features", () => {
    test("should not be able to query previously published tables", async ({
      page,
      mb,
    }) => {
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });
      await deleteToken(mb.api);

      await mb.signIn("nodata");
      await visitQuestionAdhoc(page, productsQuestionDetails);
      await assertQueryPermissionError(page);
    });

    test("should not be able to create questions even if there are published tables", async ({
      page,
      mb,
    }) => {
      await mb.api.publishTables({ table_ids: [PRODUCTS_ID] });
      await deleteToken(mb.api);

      await mb.signIn("nodata");
      await page.goto("/");
      await newButton(page).click();
      await expect(
        popover(page).getByText("Dashboard", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Question", { exact: true }),
      ).toHaveCount(0);
    });
  });
});
