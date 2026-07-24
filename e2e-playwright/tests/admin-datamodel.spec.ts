/**
 * Playwright port of e2e/test/scenarios/admin/datamodel/datamodel.cy.spec.ts
 *
 * The admin `/admin/datamodel` surface: table picker (search, tree state,
 * visibility toggles), table section (name/description, field sorting, sync
 * options), field section (name, semantic type, display values), the preview
 * section, and responsive button labels.
 *
 * Port notes
 * ----------
 * - **QA-DATABASE TIER.** Five tests restore the `postgres-writable` snapshot
 *   and drive the writable QA Postgres container; they are gated on
 *   `PW_QA_DB_ENABLED` (the deliberate gate — bare `QA_DB_ENABLED` leaks
 *   truthy from cypress.env.json).
 * - `H.resyncDatabase({ dbId })` is called with an explicit `tables` list.
 *   The bare form gates on nothing (it returns as soon as the DB has *any*
 *   synced table), so it would not wait for the `Domestic`/`Wild` tables
 *   `resetTestTableMultiSchema` just created — PORTING's 🔴 note.
 * - `cy.intercept().as()` + `cy.wait()` → `page.waitForResponse` registered
 *   before the triggering action (rule 2). The beforeEach registered eleven
 *   aliases; the never-awaited ones (`databases`, `schemas`, `fieldValues`,
 *   `updateFieldSpy`, `updateFieldValues`) are dropped. `@schema` is awaited
 *   exactly once (SEM-484) and is dropped there too — see that test.
 * - `.button("Hide table")` ports as `getByRole("button", { name, exact })`.
 *   The `exact` is load-bearing: Playwright's substring matching would let
 *   "Hide table" resolve "Unhide table" as well.
 * - Toast helpers use `.first()` + `dispatchEvent("click")`
 *   (`verifyAndCloseToastFirst` / `closeToast`), not the shared
 *   `verifyAndCloseToast`'s `click({ force: true })` — Playwright's
 *   force-click moves the real mouse and can land on a modal overlay.
 * - Metadata inputs are EditableText-style: `fill()` does not mark them
 *   dirty, so `.clear().type(x).blur()` ports as `replaceValue` +
 *   `blurFocused` (the blur must hit the element that was typed into; the
 *   field row's accessible name only updates once the PUT lands).
 * - Snowplow is *incidental* here (the "Field section" describe only calls
 *   `resetSnowplow`/`enableTracking`/`expectNoBadSnowplowEvents`, never
 *   asserting an event). Rather than rule 6's pure no-op, the browser-boundary
 *   capture is installed so `expectNoBadSnowplowEvents` at least keeps its
 *   structural form (no Iglu validation without micro).
 * - `cy.realPress("Escape")` → `parkMouseAwayFromTooltips` +
 *   `keyboard.press("Escape")` (a parked real cursor opens a tooltip that
 *   swallows the first Escape — wave-9 gotcha).
 * - Two upstream `it`s inside "Table visibility" share the title "should allow
 *   hiding and restoring all tables in a single-schema database". Duplicate
 *   titles are a hard load error in Playwright, so the second (the @external
 *   one, which is actually about a *multi*-schema database) is suffixed.
 * - "question with joins (metabase#15947-2)" is tagged `@skip` upstream and is
 *   ported as `test.skip`.
 * - Sample-data-derived values (the `Total` preview rows) are pinned by
 *   upstream and kept verbatim; a known drift risk across jars (FINDINGS #43).
 */
import type { Page } from "@playwright/test";

import {
  openOrdersTable,
  openProductsTable,
  openReviewsTable,
  openTable,
} from "../support/ad-hoc-question";
import {
  clickTableRowButton,
  foreignWritableSchemas,
  getSortDoneButton,
  getSyncOptionsButton,
  setDataModelPermissions,
  tablePicker,
  turnTableVisibilityOff,
  verifyTablesHidden,
  verifyTablesVisible,
  verifyToastAndUndo,
  waitForDataset,
  waitForTablesUpdate,
  waitForUpdateFieldDimension,
  waitForUpdateFieldOrder,
} from "../support/admin-datamodel";
import { resolveToken } from "../support/api";
import { commandPalette, openCommandPalette } from "../support/command-palette";
import { moveDnDKitElement } from "../support/dashboard-cards";
import {
  FieldSection,
  PreviewSection,
  SAMPLE_DB_SCHEMA_ID,
  TablePicker,
  TableSection,
  hoverPreviewHeaderCell,
  hovercard,
  replaceValue,
  resetTestTableMultiSchema,
  verifyTablePreview,
  visitDataModel,
  waitForFieldUpdate,
  waitForTableUpdate,
} from "../support/data-model";
import {
  blurFocused,
  getDisplayValuesInput,
  getFieldValuesButton,
  getFilteringInput,
  getSortOrderOption,
  getSortOrderRadio,
  getSortableField,
  getSortableFields,
  verifyAndCloseToastFirst,
} from "../support/datamodel-data-studio";
import { fieldSectionNameInput } from "../support/data-studio-tables";
import { parkMouseAwayFromTooltips } from "../support/documents";
import { createQuestion } from "../support/factories";
import { expect, test } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { assertTableData } from "../support/multiple-column-breakouts";
import {
  miniPicker,
  startNewQuestion,
  tableHeaderColumn,
} from "../support/notebook";
import { signInWithCachedSession } from "../support/permissions";
import {
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import {
  WRITABLE_DB_ID,
  queryWritableDB,
  resyncDatabase,
} from "../support/schema-viewer";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { tooltip as pageTooltip } from "../support/charts";
import {
  icon,
  main,
  modal,
  popover,
  queryBuilderHeader,
  visitQuestion,
} from "../support/ui";

/**
 * `H.tooltip().should("be.visible")` is an ANY-of-set assertion (rule 3) —
 * a fading-out tooltip can still be attached. Resolve the visible one.
 */
const tooltip = (page: Page) => pageTooltip(page).filter({ visible: true }).first();

const {
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

const CUSTOM_MAPPING_ERROR =
  "You need unrestricted data access on this table to map custom display values.";

const QA_DB_SKIP_REASON =
  "Requires the writable QA Postgres container and its postgres-writable snapshot (set PW_QA_DB_ENABLED)";

const EE_SKIP_REASON =
  "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend (H.activateToken)";

const visit = (page: Page, options?: Parameters<typeof visitDataModel>[2]) =>
  visitDataModel(page, "admin", options);

const getTable = (page: Page, name: string) => TablePicker.getTable(page, name);

/** Port of `cy.realPress("Escape")`. */
async function pressEscape(page: Page) {
  await parkMouseAwayFromTooltips(page);
  await page.keyboard.press("Escape");
}

/**
 * Port of the writable-postgres beforeEach shared by the @external blocks.
 * `resyncDatabase` is passed the tables `resetTestTableMultiSchema` creates —
 * the bare `{ dbId }` form gates on nothing.
 */
async function setUpWritablePostgres(mb: {
  restore: (name?: string) => Promise<void>;
  signInAsAdmin: () => Promise<void>;
  api: Parameters<typeof resyncDatabase>[0];
}) {
  await mb.restore("postgres-writable");
  await mb.signInAsAdmin();
  await resetTestTableMultiSchema();
  await resyncDatabase(mb.api, {
    dbId: WRITABLE_DB_ID,
    tables: ["Animals", "Birds"],
  });
}

/**
 * Skip when the SHARED writable Postgres container carries foreign schemas
 * (FINDINGS #85). The admin table picker is virtualized and renders ~20 rows,
 * so 26 injected `Schema A`…`Schema Z` push `Wild` — and, once the tree
 * scrolls to a selected table, the database rows themselves — out of the DOM
 * entirely. Upstream implicitly assumes a container holding only the schemas
 * `multi_schema` creates; this makes that assumption explicit instead of
 * failing four tests for a reason that is neither a port bug nor a product
 * bug. Read-only — nothing is dropped, since sibling QA-DB agents are live.
 */
async function requireCleanWritableSchemas() {
  const foreign = await foreignWritableSchemas();
  test.skip(
    foreign.length > 0,
    `Shared writable_db carries foreign schemas (${foreign.join(", ")}); the ` +
      "virtualized table picker cannot render Wild past them — see FINDINGS #85",
  );
}

test.describe("scenarios > admin > datamodel", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow to navigate to a table when on a segments page (SEM-484)", async ({
    page,
  }) => {
    await visit(page, {
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
    });

    await page.getByRole("link", { name: /Segments/ }).click();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/admin/datamodel/segments");
    // Upstream's `cy.wait("@schema")` here is satisfied RETROACTIVELY by the
    // GET /api/database/:id/schema/:schema fired during the visit above (the
    // beforeEach alias is separate from visit()'s own). waitForResponse does
    // not consume past responses, so it is dropped; the retrying assertions
    // below cover the load.

    await TablePicker.getTable(page, "Reviews").click();
    const nameInput = TableSection.getNameInput(page);
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue("Reviews");
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${REVIEWS_ID}`,
      );
  });

  test.describe("Table picker", () => {
    test.describe("1 database, 1 schema", () => {
      test("should allow to search for tables", async ({ page }) => {
        await visit(page);

        const searchInput = TablePicker.getSearchInput(page);
        await searchInput.click();
        await searchInput.pressSequentially("or");

        await expect(TablePicker.getDatabases(page)).toHaveCount(1);
        await expect(TablePicker.getSchemas(page)).toHaveCount(1);
        await expect(TablePicker.getTables(page)).toHaveCount(2);
        await expect(TablePicker.getTable(page, "Orders")).toBeVisible();
        await TablePicker.getTable(page, "Orders").click();
        await expect
          .poll(() => new URL(page.url()).pathname)
          .toBe(
            `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
          );
        await expect(TableSection.getNameInput(page)).toHaveValue("Orders");

        // no results
        await searchInput.clear();
        await searchInput.pressSequentially("xyz");
        await expect(
          tablePicker(page).getByText("No results.", { exact: true }),
        ).toBeVisible();

        // go back to browsing
        await searchInput.clear();
        await expect(TablePicker.getDatabases(page)).toHaveCount(1);
        await expect(TablePicker.getSchemas(page)).toHaveCount(0);
        await expect(TablePicker.getTables(page)).toHaveCount(8);
      });

      test("should restore previously selected table when expanding the tree (SEM-435)", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        const expectedPath = `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`;

        await TablePicker.getDatabase(page, "Sample Database").click();
        await expect
          .poll(() => new URL(page.url()).pathname)
          .toBe(expectedPath);

        await TablePicker.getDatabase(page, "Sample Database").click();
        await expect
          .poll(() => new URL(page.url()).pathname)
          .toBe(expectedPath);
      });
    });

    test.describe("mutliple databases, with single and multiple schemas", () => {
      test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

      test.beforeEach(async ({ mb }) => {
        await requireCleanWritableSchemas();
        await setUpWritablePostgres(mb);
      });

      test(
        "should allow to search for tables",
        { tag: "@external" },
        async ({ page }) => {
          await visit(page);

          const searchInput = TablePicker.getSearchInput(page);
          await searchInput.click();
          await searchInput.pressSequentially("rd");

          await expect(TablePicker.getDatabases(page)).toHaveCount(2);
          await expect(TablePicker.getSchemas(page)).toHaveCount(2);
          await expect(TablePicker.getTables(page)).toHaveCount(2);
          await expect(TablePicker.getTable(page, "Orders")).toBeVisible();
          await expect(TablePicker.getTable(page, "Birds")).toBeVisible();

          await searchInput.clear();
          await searchInput.pressSequentially("rds");
          await expect(TablePicker.getDatabases(page)).toHaveCount(1);
          await expect(TablePicker.getSchemas(page)).toHaveCount(1);
          await expect(TablePicker.getTables(page)).toHaveCount(1);
          await expect(TablePicker.getTable(page, "Birds")).toBeVisible();
          await TablePicker.getTable(page, "Birds").click();

          await expect
            .poll(() => new URL(page.url()).pathname)
            .toMatch(
              new RegExp(
                `^/admin/datamodel/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Wild/table/`,
              ),
            );
          await expect(TableSection.getNameInput(page)).toHaveValue("Birds");

          // go back to browsing
          await searchInput.clear();
          await expect(TablePicker.getDatabases(page)).toHaveCount(2);
          await expect(TablePicker.getSchemas(page)).toHaveCount(2);
          await expect(TablePicker.getTables(page)).toHaveCount(2);
        },
      );

      test(
        "should restore previously selected table when expanding the tree (SEM-435)",
        { tag: "@external" },
        async ({ page }) => {
          await visit(page);

          await TablePicker.getDatabase(page, "Writable Postgres12").click();
          await TablePicker.getSchema(page, "Domestic").click();
          await TablePicker.getTable(page, "Animals").click();
          await TablePicker.getSchema(page, "Wild").click();
          await TablePicker.getTable(page, "Birds").click();

          await TablePicker.getDatabase(page, "Writable Postgres12").click();
          await TablePicker.getDatabase(page, "Writable Postgres12").click();

          await expect(TableSection.getNameInput(page)).toHaveValue("Birds");
          await expect(TablePicker.getTable(page, "Birds")).toHaveAttribute(
            "aria-selected",
            "true",
          );
        },
      );
    });

    test.describe("Table visibility", () => {
      test("should allow changing the table visibility", async ({ page }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        let tableUpdate = waitForTableUpdate(page);
        await clickTableRowButton(
          TablePicker.getTable(page, "Orders"),
          "Hide table",
        );
        await tableUpdate;

        await verifyAndCloseToastFirst(page, "Hid Orders");

        await startNewQuestion(page);
        await miniPicker(page)
          .getByText("Sample Database", { exact: true })
          .click();
        await expect(
          miniPicker(page).getByText("People", { exact: true }),
        ).toBeVisible();
        await expect(
          miniPicker(page).getByText("Orders", { exact: true }),
        ).toHaveCount(0);

        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        tableUpdate = waitForTableUpdate(page);
        await clickTableRowButton(
          TablePicker.getTable(page, "Orders"),
          "Unhide table",
        );
        await tableUpdate;

        await verifyAndCloseToastFirst(page, "Unhid Orders");

        await startNewQuestion(page);
        await miniPicker(page)
          .getByText("Sample Database", { exact: true })
          .click();
        await expect(
          miniPicker(page).getByText("People", { exact: true }),
        ).toBeVisible();
        await expect(
          miniPicker(page).getByText("Orders", { exact: true }),
        ).toBeVisible();
      });

      test("should allow hiding and restoring all tables in a single-schema database", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        await verifyTablesHidden(page, getTable, [
          "Accounts",
          "Analytic Events",
          "Feedback",
          "Invoices",
        ]);
        await verifyTablesVisible(page, getTable, [
          "Orders",
          "People",
          "Products",
          "Reviews",
        ]);

        let tablesUpdate = waitForTablesUpdate(page);
        await clickTableRowButton(
          TablePicker.getDatabase(page, "Sample Database"),
          "Hide all tables",
        );
        await tablesUpdate;

        await verifyTablesHidden(page, getTable, [
          "Accounts",
          "Analytic Events",
          "Feedback",
          "Invoices",
          "Orders",
          "People",
          "Products",
          "Reviews",
        ]);

        tablesUpdate = waitForTablesUpdate(page);
        await verifyToastAndUndo(page, "Tables hidden");
        await tablesUpdate;

        await verifyTablesHidden(page, getTable, [
          "Accounts",
          "Analytic Events",
          "Feedback",
          "Invoices",
        ]);
        await verifyTablesVisible(page, getTable, [
          "Orders",
          "People",
          "Products",
          "Reviews",
        ]);

        tablesUpdate = waitForTablesUpdate(page);
        await clickTableRowButton(
          TablePicker.getDatabase(page, "Sample Database"),
          "Hide all tables",
        );
        await tablesUpdate;
        await verifyAndCloseToastFirst(page, "Tables hidden");

        await verifyTablesHidden(page, getTable, [
          "Accounts",
          "Analytic Events",
          "Feedback",
          "Invoices",
          "Orders",
          "People",
          "Products",
          "Reviews",
        ]);

        tablesUpdate = waitForTablesUpdate(page);
        await clickTableRowButton(
          TablePicker.getDatabase(page, "Sample Database"),
          "Unhide all tables",
        );
        await tablesUpdate;
        await verifyAndCloseToastFirst(page, "Tables unhidden");

        await verifyTablesVisible(page, getTable, [
          "Accounts",
          "Analytic Events",
          "Feedback",
          "Invoices",
          "Orders",
          "People",
          "Products",
          "Reviews",
        ]);
      });

      // Upstream repeats the previous test's title verbatim; duplicate titles
      // are a hard load error in Playwright, so this one is suffixed with what
      // it actually covers (a multi-schema database).
      test(
        "should allow hiding and restoring all tables in a single-schema database (multi-schema database)",
        { tag: "@external" },
        async ({ page, mb }) => {
          test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
          await requireCleanWritableSchemas();
          await setUpWritablePostgres(mb);

          await visit(page);

          await TablePicker.getDatabase(page, "Writable Postgres12").click();
          await expect(
            TablePicker.getDatabase(page, "Writable Postgres12").getByRole(
              "button",
              { name: "Hide all tables", exact: true },
            ),
          ).toHaveCount(0);
          await expect(
            TablePicker.getSchema(page, "Domestic").getByRole("button", {
              name: "Hide all tables",
              exact: true,
            }),
          ).toHaveCount(0);
          await expect(
            TablePicker.getSchema(page, "Wild").getByRole("button", {
              name: "Hide all tables",
              exact: true,
            }),
          ).toHaveCount(0);

          await TablePicker.getSchema(page, "Wild").click();
          await expect(
            TablePicker.getDatabase(page, "Writable Postgres12").getByRole(
              "button",
              { name: "Hide all tables", exact: true },
            ),
          ).toHaveCount(0);
          await expect(
            TablePicker.getSchema(page, "Domestic").getByRole("button", {
              name: "Hide all tables",
              exact: true,
            }),
          ).toHaveCount(0);
          await verifyTablesVisible(page, getTable, ["Animals", "Birds"]);

          let tablesUpdate = waitForTablesUpdate(page);
          await clickTableRowButton(
            TablePicker.getSchema(page, "Wild"),
            "Hide all tables",
          );
          await tablesUpdate;
          await verifyTablesHidden(page, getTable, ["Animals", "Birds"]);

          tablesUpdate = waitForTablesUpdate(page);
          await verifyToastAndUndo(page, "Tables hidden");
          await tablesUpdate;
          await verifyTablesVisible(page, getTable, ["Animals", "Birds"]);
        },
      );

      test(
        "should update the table picker state when toggling visibility of not currently selected branch",
        { tag: "@external" },
        async ({ page, mb }) => {
          test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
          await requireCleanWritableSchemas();
          await setUpWritablePostgres(mb);

          await visit(page);

          await TablePicker.getDatabase(page, "Sample Database").click();
          await TablePicker.getDatabase(page, "Writable Postgres12").click();
          await TablePicker.getSchema(page, "Wild").click();
          await TablePicker.getTable(page, "Animals").click();

          const tableUpdate = waitForTableUpdate(page);
          await clickTableRowButton(
            TablePicker.getTable(page, "Accounts"),
            "Unhide table",
          );
          await tableUpdate;
          await verifyTablesVisible(page, getTable, ["Accounts"]);

          const tablesUpdate = waitForTablesUpdate(page);
          await clickTableRowButton(
            TablePicker.getDatabase(page, "Sample Database"),
            "Hide all tables",
          );
          await tablesUpdate;
          await verifyTablesHidden(page, getTable, [
            "Accounts",
            "Analytic Events",
            "Feedback",
            "Invoices",
            "Orders",
            "People",
            "Products",
            "Reviews",
          ]);
        },
      );

      test("hidden table should not show up in various places in UI", async ({
        page,
        mb,
      }) => {
        await mb.signInAsAdmin();

        // Toggle the orders table to be hidden as admin user
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });
        const tableUpdate = waitForTableUpdate(page);
        await clickTableRowButton(
          TablePicker.getTable(page, "Orders"),
          "Hide table",
        );
        await tableUpdate;

        // Visit the main page, we shouldn't be able to see the table
        await page.goto(`/browse/databases/${SAMPLE_DB_ID}`);

        const browseSchemas = page.getByTestId("browse-schemas");
        await expect(
          browseSchemas.getByText("Products", { exact: true }),
        ).toBeVisible();
        await expect(
          browseSchemas.getByText("Orders", { exact: true }),
        ).toHaveCount(0);

        // It shouldn't show up for a normal user either
        await mb.signInAsNormalUser();
        await page.goto(`/browse/databases/${SAMPLE_DB_ID}`);

        await expect(
          browseSchemas.getByText("Products", { exact: true }),
        ).toBeVisible();
        await expect(
          browseSchemas.getByText("Orders", { exact: true }),
        ).toHaveCount(0);

        // It shouldn't show in a new question data picker
        await startNewQuestion(page);
        await miniPicker(page)
          .getByText("Sample Database", { exact: true })
          .click();
        // cy.contains is a case-sensitive substring, first match
        await expect(
          miniPicker(page).getByText(/Products/).first(),
        ).toBeAttached();
        await expect(miniPicker(page).getByText(/Orders/)).toHaveCount(0);
      });

      test.describe("shouldn't prevent editing related question after turning table visibility off (metabase#15947)", () => {
        test("simple question (metabase#15947-1)", async ({ page, mb }) => {
          await turnTableVisibilityOff(mb.api, ORDERS_ID);
          await visitQuestion(page, ORDERS_QUESTION_ID);

          await expect(
            queryBuilderHeader(page).getByText("View-only", { exact: true }),
          ).toBeVisible();
        });

        // Tagged `@skip` upstream, so it never runs there either. The body is
        // ported verbatim so the port stays 1:1 if the tag is ever removed.
        test.skip("question with joins (metabase#15947-2)", async ({
          page,
          mb,
        }) => {
          const card = await createQuestion(mb.api, {
            name: "15947",
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
              ],
              filter: [
                "and",
                ["=", ["field", ORDERS.QUANTITY, null], 1],
                [
                  ">",
                  ["field", PRODUCTS.RATING, { "join-alias": "Products" }],
                  3,
                ],
              ],
              aggregation: [
                ["sum", ["field", ORDERS.TOTAL, null]],
                [
                  "sum",
                  ["field", PRODUCTS.RATING, { "join-alias": "Products" }],
                ],
              ],
              breakout: [
                ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
                ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
              ],
            },
          });

          await turnTableVisibilityOff(mb.api, PRODUCTS_ID);
          await page.goto(`/question/${card.id}/notebook`);
          await expect(page.getByText("Products").first()).toBeVisible();
          await expect(
            page.getByText("Quantity is equal to 1").first(),
          ).toBeVisible();
          await expect(
            page.getByText("Rating is greater than 3").first(),
          ).toBeVisible();
          await expect(
            queryBuilderHeader(page).getByText("View-only", { exact: true }),
          ).toBeVisible();
        });
      });
    });
  });

  test.describe("Table section", () => {
    test.describe("Name and description", () => {
      test("should allow changing the table name with data model permissions only", async ({
        page,
        mb,
      }) => {
        test.skip(!resolveToken("pro-self-hosted"), EE_SKIP_REASON);
        await mb.api.activateToken("pro-self-hosted");
        await setDataModelPermissions(mb.api, {
          databaseId: SAMPLE_DB_ID,
          tableIds: [ORDERS_ID],
        });

        await signInWithCachedSession(page.context(), "none");
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        const tableUpdate = waitForTableUpdate(page);
        await replaceValue(TableSection.getNameInput(page), "New orders");
        await blurFocused(page);
        await tableUpdate;
        await verifyAndCloseToastFirst(page, "Table name updated");
        await expect(TableSection.getNameInput(page)).toHaveValue("New orders");

        await mb.signInAsNormalUser();
        await startNewQuestion(page);
        await miniPicker(page)
          .getByText("Sample Database", { exact: true })
          .click();
        await expect(
          miniPicker(page).getByText("People", { exact: true }),
        ).toBeVisible();
        await expect(
          miniPicker(page).getByText("New orders", { exact: true }),
        ).toBeVisible();
      });
    });

    test.describe("Field name and description", () => {
      test("should allow changing the field name with data model permissions only", async ({
        page,
        mb,
      }) => {
        test.skip(!resolveToken("pro-self-hosted"), EE_SKIP_REASON);
        await mb.api.activateToken("pro-self-hosted");
        await setDataModelPermissions(mb.api, {
          databaseId: SAMPLE_DB_ID,
          tableIds: [ORDERS_ID],
        });
        await signInWithCachedSession(page.context(), "none");
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        const fieldUpdate = waitForFieldUpdate(page);
        await replaceValue(
          TableSection.getFieldNameInput(page, "Tax"),
          "New tax",
        );
        await blurFocused(page);
        await fieldUpdate;
        await verifyAndCloseToastFirst(page, "Name of Tax updated");
        await expect(
          TableSection.getFieldNameInput(page, "New tax"),
        ).toBeVisible();
        await expect(TableSection.getField(page, "New tax")).toBeVisible();

        // verify preview
        await TableSection.clickField(page, "New tax");
        let dataset = waitForDataset(page);
        await FieldSection.getPreviewButton(page).click();
        await dataset;
        await expect(
          PreviewSection.get(page).getByText(
            "Sorry, you don’t have permission to see that.",
            { exact: true },
          ),
        ).toBeVisible();

        dataset = waitForDataset(page);
        await PreviewSection.getPreviewTypeInput(page)
          .getByText("Detail", { exact: true })
          .click();
        await dataset;
        await expect(
          PreviewSection.get(page).getByText(
            "Sorry, you don’t have permission to see that.",
            { exact: true },
          ),
        ).toBeVisible();

        // verify viz as normal user
        await mb.signInAsNormalUser();
        await openOrdersTable(page);
        await expect(tableHeaderColumn(page, "New tax")).toBeVisible();
        await expect(tableHeaderColumn(page, "Tax")).toHaveCount(0);
      });

      test("should allow clearing the field description", async ({ page }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        const fieldUpdate = waitForFieldUpdate(page);
        await replaceValue(
          TableSection.getFieldDescriptionInput(page, "Total"),
          "",
        );
        await blurFocused(page);
        await fieldUpdate;
        await verifyAndCloseToastFirst(page, "Description of Total updated");
        await expect(
          TableSection.getFieldDescriptionInput(page, "Total"),
        ).toHaveValue("");

        // verify preview
        await TableSection.clickField(page, "Total");
        await FieldSection.getPreviewButton(page).click();
        await verifyTablePreview(page, {
          column: "Total",
          values: ["39.72", "117.03", "49.21", "115.23", "134.91"],
        });
        await hoverPreviewHeaderCell(page);
        await expect(hovercard(page)).not.toContainText(
          "The total billed amount.",
        );

        await page.goto(
          `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
        );
        await expect(page.getByText("Total", { exact: true })).toBeVisible();
        await expect(
          page.getByText("No description yet", { exact: true }),
        ).toBeVisible();
      });
    });

    test.describe("Sorting", () => {
      test("should allow sorting fields as in the database", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        await TableSection.getSortButton(page).click();
        await expect(getSortOrderRadio(page, "database")).toBeChecked();

        await openProductsTable(page);
        await assertTableData(page, {
          columns: [
            "ID",
            "Ean",
            "Title",
            "Category",
            "Vendor",
            "Price",
            "Rating",
            "Created At",
          ],
        });
      });

      test("should allow sorting fields alphabetically", async ({ page }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        await TableSection.getSortButton(page).click();
        const tableUpdate = waitForTableUpdate(page);
        await getSortOrderOption(page, "Alphabetical order").click();
        await tableUpdate;
        await verifyAndCloseToastFirst(page, "Field order updated");
        await expect(getSortOrderRadio(page, "alphabetical")).toBeChecked();

        await openProductsTable(page);
        await assertTableData(page, {
          columns: [
            "Category",
            "Created At",
            "Ean",
            "ID",
            "Price",
            "Rating",
            "Title",
            "Vendor",
          ],
        });
      });

      test("should allow sorting fields smartly", async ({ page }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        await TableSection.getSortButton(page).click();
        const tableUpdate = waitForTableUpdate(page);
        await getSortOrderOption(page, "Auto order").click();
        await tableUpdate;
        await verifyAndCloseToastFirst(page, "Field order updated");
        await expect(getSortOrderRadio(page, "smart")).toBeChecked();

        await openProductsTable(page);
        await assertTableData(page, {
          columns: [
            "ID",
            "Created At",
            "Category",
            "Ean",
            "Price",
            "Rating",
            "Title",
            "Vendor",
          ],
        });
      });

      test("should allow sorting fields in the custom order", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        await TableSection.getSortButton(page).click();
        await expect(getSortOrderRadio(page, "database")).toBeChecked();

        const fieldOrder = waitForUpdateFieldOrder(page);
        await moveDnDKitElement(getSortableField(page, "ID"), { vertical: 50 });
        await fieldOrder;
        await verifyAndCloseToastFirst(page, "Field order updated");

        // should not show loading state after an update (metabase#56482).
        // `{ timeout: 0 }` upstream makes this an explicitly MOMENTARY,
        // one-shot absence check — the documented carve-out where a
        // non-retrying count() is the faithful port.
        expect(await page.getByTestId("loading-indicator").count()).toBe(0);

        await expect(getSortOrderRadio(page, "custom")).toBeChecked();

        await openProductsTable(page);
        await assertTableData(page, {
          columns: [
            "Ean",
            "ID",
            "Title",
            "Category",
            "Vendor",
            "Price",
            "Rating",
            "Created At",
          ],
        });
      });

      test("should allow switching to predefined order after drag & drop (metabase#56482)", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        await TableSection.getSortButton(page).click();
        await expect(getSortOrderRadio(page, "database")).toBeChecked();

        let fieldOrder = waitForUpdateFieldOrder(page);
        await moveDnDKitElement(getSortableField(page, "ID"), { vertical: 50 });
        await fieldOrder;
        await verifyAndCloseToastFirst(page, "Field order updated");

        expect(await page.getByTestId("loading-indicator").count()).toBe(0);

        await expect(getSortableFields(page).nth(0)).toHaveText("Ean");
        await expect(getSortableFields(page).nth(1)).toHaveText("ID");

        await expect(getSortOrderRadio(page, "custom")).toBeChecked();

        // should allow switching to predefined order afterwards (metabase#56482)
        const tableUpdate = waitForTableUpdate(page);
        await getSortOrderOption(page, "Database order").click();
        await tableUpdate;

        await expect(getSortOrderRadio(page, "database")).toBeChecked();
        await expect(getSortableFields(page).nth(0)).toHaveText("ID");
        await expect(getSortableFields(page).nth(1)).toHaveText("Ean");

        // should allow drag & drop afterwards (metabase#56482) — extra sanity check
        fieldOrder = waitForUpdateFieldOrder(page);
        await moveDnDKitElement(getSortableField(page, "ID"), { vertical: 50 });
        await fieldOrder;

        expect(await page.getByTestId("loading-indicator").count()).toBe(0);

        await expect(getSortableFields(page).nth(0)).toHaveText("Ean");
        await expect(getSortableFields(page).nth(1)).toHaveText("ID");
      });
    });

    test.describe("Sync options", () => {
      test("should allow to sync table schema, re-scan table, and discard cached field values", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });
        await getSyncOptionsButton(page).click();

        const dialog = modal(page);

        // sync table schema
        await dialog
          .getByRole("button", { name: "Sync table schema", exact: true })
          .click();
        await expect(
          dialog.getByRole("button", { name: "Sync table schema", exact: true }),
        ).toHaveCount(0);
        await expect(
          dialog.getByRole("button", { name: "Sync triggered!", exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "Sync triggered!", exact: true }),
        ).toHaveCount(0);
        await expect(
          dialog.getByRole("button", { name: "Sync table schema", exact: true }),
        ).toBeVisible();

        // re-scan table
        await dialog
          .getByRole("button", { name: "Re-scan table", exact: true })
          .click();
        await expect(
          dialog.getByRole("button", { name: "Re-scan table", exact: true }),
        ).toHaveCount(0);
        await expect(
          dialog.getByRole("button", { name: "Scan triggered!", exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "Scan triggered!", exact: true }),
        ).toHaveCount(0);
        await expect(
          dialog.getByRole("button", { name: "Re-scan table", exact: true }),
        ).toBeVisible();

        // discard cached field values
        await dialog
          .getByRole("button", {
            name: "Discard cached field values",
            exact: true,
          })
          .click();
        await expect(
          dialog.getByRole("button", {
            name: "Discard cached field values",
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          dialog.getByRole("button", {
            name: "Discard triggered!",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", {
            name: "Discard triggered!",
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          dialog.getByRole("button", {
            name: "Discard cached field values",
            exact: true,
          }),
        ).toBeVisible();

        await pressEscape(page);
        await expect(modal(page)).toHaveCount(0);
      });
    });
  });

  test.describe("Field section", () => {
    let capture: SnowplowCapture;

    test.beforeEach(async ({ page, mb }) => {
      // H.resetSnowplow() + H.enableTracking(): the capture starts empty per
      // test and forces the tracking settings on in the browser.
      capture = await installSnowplowCapture(page, mb.baseUrl);
    });

    test.afterEach(async () => {
      // Structural stand-in for H.expectNoBadSnowplowEvents (no Iglu
      // validation without snowplow-micro).
      expectNoBadSnowplowEvents(capture);
    });

    test.describe("Name and description", () => {
      test("should allow changing the field name with data model permissions only", async ({
        page,
        mb,
      }) => {
        test.skip(!resolveToken("pro-self-hosted"), EE_SKIP_REASON);
        await mb.api.activateToken("pro-self-hosted");
        await setDataModelPermissions(mb.api, {
          databaseId: SAMPLE_DB_ID,
          tableIds: [ORDERS_ID],
        });
        await signInWithCachedSession(page.context(), "none");
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.TOTAL,
        });

        const fieldUpdate = waitForFieldUpdate(page);
        await replaceValue(fieldSectionNameInput(page), "New total");
        await blurFocused(page);
        await fieldUpdate;
        await verifyAndCloseToastFirst(page, "Name of Total updated");
        await expect(fieldSectionNameInput(page)).toHaveValue("New total");
        const listedInput = TableSection.getFieldNameInput(page, "New total");
        await listedInput.scrollIntoViewIfNeeded();
        await expect(listedInput).toBeVisible();

        // verify preview
        await TableSection.clickField(page, "New total");
        let dataset = waitForDataset(page);
        await FieldSection.getPreviewButton(page).click();
        await dataset;
        await expect(
          PreviewSection.get(page).getByText(
            "Sorry, you don’t have permission to see that.",
            { exact: true },
          ),
        ).toBeVisible();

        dataset = waitForDataset(page);
        await PreviewSection.getPreviewTypeInput(page)
          .getByText("Detail", { exact: true })
          .click();
        await dataset;
        await expect(
          PreviewSection.get(page).getByText(
            "Sorry, you don’t have permission to see that.",
            { exact: true },
          ),
        ).toBeVisible();

        // verify viz as normal user
        await mb.signInAsNormalUser();
        await openOrdersTable(page);
        await expect(tableHeaderColumn(page, "New total")).toBeVisible();
        await expect(tableHeaderColumn(page, "Total")).toHaveCount(0);
      });
    });

    test.describe("Metadata", () => {
      test.describe("Semantic type", () => {
        test("should allow to change the field foreign key target with no permissions to Reviews table", async ({
          page,
          mb,
        }) => {
          test.skip(!resolveToken("pro-self-hosted"), EE_SKIP_REASON);
          await mb.api.activateToken("pro-self-hosted");
          await setDataModelPermissions(mb.api, {
            databaseId: SAMPLE_DB_ID,
            tableIds: [ORDERS_ID, PRODUCTS_ID, PEOPLE_ID],
          });

          await signInWithCachedSession(page.context(), "none");
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.USER_ID,
          });
          const fkTarget = FieldSection.getSemanticTypeFkTarget(page);
          await expect(fkTarget).toHaveValue("People → ID");
          await fkTarget.click();

          // Anchor on an option that IS present before asserting the absence
          // of "Reviews → ID" — otherwise the absence check is satisfied by
          // "the popover hasn't rendered yet".
          await expect(
            popover(page).getByText("Products → ID", { exact: true }),
          ).toBeVisible();
          await expect(
            popover(page).getByText("Reviews → ID", { exact: true }),
          ).toHaveCount(0);

          const fieldUpdate = waitForFieldUpdate(page);
          await popover(page)
            .getByText("Products → ID", { exact: true })
            .click();
          await fieldUpdate;
          await expect(undoToast(page).first()).toContainText(
            "Semantic type of User ID updated",
          );
          await expect(FieldSection.getSemanticTypeFkTarget(page)).toHaveValue(
            "Products → ID",
          );

          // verify preview
          let dataset = waitForDataset(page);
          await FieldSection.getPreviewButton(page).click();
          await dataset;
          await expect(
            PreviewSection.get(page).getByText(
              "Sorry, you don’t have permission to see that.",
              { exact: true },
            ),
          ).toBeVisible();

          dataset = waitForDataset(page);
          await PreviewSection.getPreviewTypeInput(page)
            .getByText("Detail", { exact: true })
            .click();
          await dataset;
          await expect(
            PreviewSection.get(page).getByText(
              "Sorry, you don’t have permission to see that.",
              { exact: true },
            ),
          ).toBeVisible();

          // verify viz as normal user
          await mb.signInAsNormalUser();
          await openTable(page, {
            database: SAMPLE_DB_ID,
            table: ORDERS_ID,
            mode: "notebook",
          });
          await icon(page, "join_left_outer").click();
          await miniPicker(page)
            .getByText("Sample Database", { exact: true })
            .click();
          await miniPicker(page)
            .getByText("Products", { exact: true })
            .click();
          await expect(page.getByLabel("Left column")).toContainText("User ID");
        });

        test("should not allow setting foreign key target for inaccessible tables", async ({
          page,
          mb,
        }) => {
          test.skip(!resolveToken("pro-self-hosted"), EE_SKIP_REASON);
          await mb.api.activateToken("pro-self-hosted");
          await setDataModelPermissions(mb.api, {
            databaseId: SAMPLE_DB_ID,
            tableIds: [REVIEWS_ID],
          });

          await signInWithCachedSession(page.context(), "none");
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.PRODUCT_ID,
          });
          await getDisplayValuesInput(page).click();

          // `exact` is dropped: Mantine's renderOption injects an Icon
          // aria-label into the option's accessible name (PORTING).
          const original = popover(page).getByRole("option", {
            name: /Use original value/,
          });
          await expect(original).toBeVisible();
          await expect(original).not.toHaveAttribute("data-combobox-disabled");

          const foreignKey = popover(page).getByRole("option", {
            name: /Use foreign key/,
          });
          await expect(foreignKey).toBeVisible();
          await expect(foreignKey).toHaveAttribute(
            "data-combobox-disabled",
            "true",
          );
        });
      });
    });

    test.describe("Behavior", () => {
      test.describe("Display values", () => {
        test("should allow to change foreign key target for accessible tables", async ({
          page,
          mb,
        }) => {
          test.skip(!resolveToken("pro-self-hosted"), EE_SKIP_REASON);
          await mb.api.activateToken("pro-self-hosted");
          await setDataModelPermissions(mb.api, {
            databaseId: SAMPLE_DB_ID,
            tableIds: [ORDERS_ID, REVIEWS_ID, PRODUCTS_ID],
          });

          await signInWithCachedSession(page.context(), "none");
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.PRODUCT_ID,
          });

          await getDisplayValuesInput(page).click();
          await popover(page)
            .getByText("Use foreign key", { exact: true })
            .click();
          const dimension = waitForUpdateFieldDimension(page);
          await popover(page).getByText("Title", { exact: true }).click();
          await dimension;
          await expect(undoToast(page).first()).toContainText(
            "Display values of Product ID updated",
          );

          await mb.signInAsNormalUser();
          await openReviewsTable(page, { limit: 1 });
          await expect(
            page.getByText("Rustic Paper Wallet", { exact: true }).first(),
          ).toBeVisible();
        });

        test("should show a proper error message when using custom mapping", async ({
          page,
          mb,
        }) => {
          test.skip(!resolveToken("pro-self-hosted"), EE_SKIP_REASON);
          await mb.api.activateToken("pro-self-hosted");
          await setDataModelPermissions(mb.api, {
            databaseId: SAMPLE_DB_ID,
            tableIds: [REVIEWS_ID],
          });

          await signInWithCachedSession(page.context(), "none");
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });
          await getDisplayValuesInput(page).click();

          const original = popover(page).getByRole("option", {
            name: /Use original value/,
          });
          await expect(original).toBeVisible();
          await expect(original).not.toHaveAttribute("data-combobox-disabled");

          const custom = popover(page).getByRole("option", {
            name: /Custom mapping/,
          });
          await expect(custom).toBeVisible();
          await expect(custom).toHaveAttribute(
            "data-combobox-disabled",
            "true",
          );

          await mb.signInAsAdmin();
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });
          await getDisplayValuesInput(page).click();
          const dimension = waitForUpdateFieldDimension(page);
          await popover(page)
            .getByText("Custom mapping", { exact: true })
            .click();
          await dimension;
          await expect(undoToast(page).first()).toContainText(
            "Display values of Rating updated",
          );

          await signInWithCachedSession(page.context(), "none");
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });

          await expect(
            page.getByText(CUSTOM_MAPPING_ERROR, { exact: true }),
          ).toBeAttached();
        });
      });
    });
  });

  test.describe("Preview section", () => {
    test.describe("Esc key", () => {
      test("should allow closing the preview with Esc key", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        await expect(PreviewSection.get(page)).toHaveCount(0);

        await FieldSection.getPreviewButton(page).click();
        await expect(PreviewSection.get(page)).toBeVisible();

        await pressEscape(page);
        await expect(PreviewSection.get(page)).toHaveCount(0);
      });

      test("should not close the preview when hitting Esc key while modal is open", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        await FieldSection.getPreviewButton(page).click();
        await expect(PreviewSection.get(page)).toBeVisible();

        await getSyncOptionsButton(page).click();
        await expect(modal(page)).toBeVisible();

        await pressEscape(page);
        await expect(modal(page)).toHaveCount(0);
        await expect(PreviewSection.get(page)).toBeVisible();

        await getFieldValuesButton(page).click();
        await expect(modal(page)).toBeVisible();

        await pressEscape(page);
        await expect(modal(page)).toHaveCount(0);
        await expect(PreviewSection.get(page)).toBeVisible();
      });

      test("should not close the preview when hitting Esc key while popover is open", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        await FieldSection.getPreviewButton(page).click();
        await expect(PreviewSection.get(page)).toBeVisible();

        await FieldSection.getSemanticTypeInput(page).click();
        await expect(popover(page)).toBeVisible();

        await pressEscape(page);
        // Upstream: `H.popover({ skipVisibilityCheck: true }).should("not.be.visible")`.
        // The shared popover() locator is already visibility-filtered, so "no
        // visible popover" is the equivalent assertion.
        await expect(popover(page)).toHaveCount(0);
        await expect(PreviewSection.get(page)).toBeVisible();
      });

      test("should not close the preview when hitting Esc key while command palette is open", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        await FieldSection.getPreviewButton(page).click();
        await expect(PreviewSection.get(page)).toBeVisible();

        await openCommandPalette(page);
        await expect(commandPalette(page)).toBeVisible();

        await pressEscape(page);
        await expect(commandPalette(page)).toHaveCount(0);
        await expect(PreviewSection.get(page)).toBeVisible();
      });
    });

    test.describe("Empty states", () => {
      test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

      test.beforeEach(async ({ mb }) => {
        await setUpWritablePostgres(mb);
        await queryWritableDB('delete from "Domestic"."Animals"');
      });

      test(
        "should show empty state when there is no data",
        { tag: "@external" },
        async ({ page }) => {
          await visit(page);

          await TablePicker.getDatabase(page, "Writable Postgres12").click();
          await TablePicker.getSchema(page, "Domestic").click();
          await TablePicker.getTable(page, "Animals").click();
          await TableSection.clickField(page, "Name");
          await FieldSection.getPreviewButton(page).click();

          await expect(
            PreviewSection.get(page).getByText("No data to show", {
              exact: true,
            }),
          ).toBeVisible();
          await PreviewSection.getPreviewTypeInput(page)
            .getByText("Detail", { exact: true })
            .click();
          await expect(
            PreviewSection.get(page).getByText("No data to show", {
              exact: true,
            }),
          ).toBeVisible();
        },
      );
    });

    test("should not auto-focus inputs in filtering preview", async ({
      page,
    }) => {
      await visit(page, {
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.PRODUCT_ID,
      });

      await FieldSection.getPreviewButton(page).click();
      await PreviewSection.getPreviewTypeInput(page)
        .getByText("Filtering", { exact: true })
        .click();

      let input = PreviewSection.get(page).getByPlaceholder("Enter an ID", {
        exact: true,
      });
      await expect(input).toBeVisible();
      await expect(input).not.toBeFocused();

      await getFilteringInput(page).click();
      await popover(page).getByText("A list of all values", { exact: true }).click();

      input = PreviewSection.get(page).getByPlaceholder("Search the list", {
        exact: true,
      });
      await expect(input).toBeVisible();
      await expect(input).not.toBeFocused();

      await TableSection.clickField(page, "Tax");

      input = PreviewSection.get(page).getByPlaceholder("Min", { exact: true });
      await expect(input).toBeVisible();
      await expect(input).not.toBeFocused();

      await getFilteringInput(page).click();
      await popover(page).getByText("Search box", { exact: true }).click();

      input = PreviewSection.get(page).getByPlaceholder("Enter a number", {
        exact: true,
      });
      await expect(input).toBeVisible();
      await expect(input).not.toBeFocused();
    });

    test("should not crash when viewing filtering preview of a hidden table", async ({
      page,
    }) => {
      await visit(page, {
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.PRODUCT_ID,
      });

      const tableUpdate = waitForTableUpdate(page);
      await clickTableRowButton(
        TablePicker.getTable(page, "Orders"),
        "Hide table",
      );
      await tableUpdate;

      await FieldSection.getPreviewButton(page).click();
      await PreviewSection.getPreviewTypeInput(page)
        .getByText("Filtering", { exact: true })
        .click();
      await expect(
        PreviewSection.get(page).getByPlaceholder("Enter an ID", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Something’s gone wrong", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("Responsiveness", () => {
    test("should hide labels of buttons when they don't fit", async ({
      page,
    }) => {
      await visit(page, {
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });

      // buttons should show labels when they fit
      await expect(getSyncOptionsButton(page)).toHaveText("Sync options");
      await expect(TableSection.getSortButton(page)).toHaveText("Sorting");
      await TableSection.getSortButton(page).click();
      await expect(getSortDoneButton(page)).toHaveText("Done");
      await getSortDoneButton(page).click();
      await expect(FieldSection.getPreviewButton(page)).toHaveText("Preview");
      await expect(getFieldValuesButton(page)).toHaveText("Field values");

      // buttons should not show labels when they don't fit
      await page.setViewportSize({ width: 800, height: 800 });
      await expect(getSyncOptionsButton(page)).not.toHaveText("Sync options");
      await expect(TableSection.getSortButton(page)).not.toHaveText("Sorting");
      await TableSection.getSortButton(page).click();
      await expect(getSortDoneButton(page)).not.toHaveText("Done");
      await getSortDoneButton(page).click();
      await expect(FieldSection.getPreviewButton(page)).not.toHaveText(
        "Preview",
      );
      await expect(getFieldValuesButton(page)).not.toHaveText("Field values");

      // buttons should have tooltips when labels are not shown
      await getSyncOptionsButton(page).hover();
      await expect(tooltip(page)).toBeVisible();
      await expect(tooltip(page)).toHaveText("Sync options");

      await TableSection.getSortButton(page).hover();
      await expect(tooltip(page)).toBeVisible();
      await expect(tooltip(page)).toHaveText("Sorting");

      await TableSection.getSortButton(page).click();
      await getSortDoneButton(page).hover();
      await expect(tooltip(page)).toBeVisible();
      await expect(tooltip(page)).toHaveText("Done");
      await getSortDoneButton(page).click();

      await FieldSection.getPreviewButton(page).hover();
      await expect(tooltip(page)).toBeVisible();
      await expect(tooltip(page)).toHaveText("Preview");

      await getFieldValuesButton(page).hover();
      await expect(tooltip(page)).toBeVisible();
      await expect(tooltip(page)).toHaveText("Field values");

      // button labels should reappear when they can fit again
      await page.setViewportSize({ width: 1200, height: 800 });
      await expect(getSyncOptionsButton(page)).toHaveText("Sync options");
      await expect(TableSection.getSortButton(page)).toHaveText("Sorting");
      await TableSection.getSortButton(page).click();
      await expect(getSortDoneButton(page)).toHaveText("Done");
      await getSortDoneButton(page).click();
      await expect(FieldSection.getPreviewButton(page)).toHaveText("Preview");
      await expect(getFieldValuesButton(page)).toHaveText("Field values");
    });
  });
});
