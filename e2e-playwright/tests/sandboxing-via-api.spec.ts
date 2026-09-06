/**
 * Port of e2e/test/scenarios/permissions/sandboxing/sandboxing-via-api.cy.spec.js
 *
 * Sandboxing (row-and-column security) is a security surface, so the port is
 * deliberately literal: every `assertDatasetReqIsSandboxed` call keeps the
 * exact options upstream passes, including the two places where those options
 * are silently inert (documented at the call sites — see the header notes
 * below). Nothing is merged, dropped, or strengthened.
 *
 * Notes carried over from the original that a reader will otherwise trip on:
 *
 * 1. "should be sandboxed even after applying a filter to the question" passes
 *    `columnAssetion` (sic) — a typo'd option name, so
 *    `assertDatasetReqIsSandboxed`'s `if (columnId && columnAssertion)` branch
 *    never runs and only `is_sandboxed` is checked. Ported as-is; had the typo
 *    been fixed the value would still be wrong (`"3"` as a string vs the
 *    numeric column), so "fixing" it here would turn the test red for a reason
 *    that is not a product bug. Recorded in findings-inbox.
 * 2. "should allow using a dashboard question as a sandbox source" passes
 *    `columnId: PEOPLE.USER_ID`, and PEOPLE has no USER_ID field — the constant
 *    is `undefined`, so again only `is_sandboxed` is checked. Ported as-is.
 *
 * cy.intercept aliases → `page.waitForResponse` registered before the
 * triggering navigation (porting rule 2); the captured Response is what the
 * sandboxing assertions read, standing in for `cy.get("@alias")`.
 *
 * Bare `cy.findByText(x)` / `cy.contains(x)` calls in the original are implicit
 * existence assertions (testing-library throws when the query finds nothing);
 * they are ported as `toBeVisible()` on the first match.
 */
import { expect, test } from "../support/fixtures";
import { openOrdersTable } from "../support/ad-hoc-question";
import { modifyPermission } from "../support/admin-permissions";
import { configureSmtpSettings } from "../support/admin-extras";
import { openVizSettingsSidebar } from "../support/charts";
import { selectPermissionRow } from "../support/create-queries";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  sidebar,
} from "../support/dashboard";
import { sandboxTable, updatePermissionsGraph } from "../support/dashboard-repros";
import { remapDisplayValueToFK } from "../support/detail-view";
import { pickEntity } from "../support/entity-picker";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { filterNotebook, summarizeNotebook } from "../support/joins";
import { chartPathWithFillColor } from "../support/legend";
import { assertTableRowsCount } from "../support/interactive-embedding";
import { assertDatasetReqIsSandboxed } from "../support/notebook-link-to-data-source";
import {
  assertQueryBuilderRowCount,
  miniPicker,
  openNotebook,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import { selectFilterOperator } from "../support/nested-questions";
import { openDashboardMenu } from "../support/organization";
import {
  isMaildevRunning,
  setupSMTP,
} from "../support/onboarding-extras";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import { sendEmailAndGetFirst } from "../support/sharing-reproductions";
import {
  ALL_USERS_GROUP,
  COLLECTION_GROUP,
  DATA_GROUP,
  NORMAL_USER_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  SANDBOXED_ATTR_UID,
  VIEW_DATA_PERMISSION_INDEX,
  createJoinedQuestion,
  createUserFromRawData,
  dashboardCards,
  firstColumnCells,
  isCardQueryResponse,
  isDashcardQueryResponse,
  isDatasetResponse,
  main,
  openTableCapturingDataset,
  preparePermissions,
  savePermissions,
  signInWithCredentials,
  tableInteractive,
  visitQuestionCapturingCardQuery,
} from "../support/sandboxing-via-api";
import { icon, modal, popover, visitDashboard } from "../support/ui";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATABASE;

test.describe("admin > permissions > sandboxes (tested via the API)", () => {
  test.describe("admin", () => {
    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await preparePermissions(mb.api);
      await page.goto("/admin/people");
    });

    test("should add key attributes to an existing user", async ({ page }) => {
      await icon(page.getByTestId("admin-people-list-table"), "ellipsis")
        .first()
        .click();
      await popover(page).getByText("Edit user", { exact: true }).click();

      const dialog = modal(page);
      await dialog.getByText("Attributes", { exact: true }).click();
      await dialog.getByText("Add an attribute", { exact: true }).click();
      await dialog.getByPlaceholder("Key", { exact: true }).fill("User ID");
      await dialog.getByPlaceholder("Value", { exact: true }).fill("3");
      await dialog.getByText("Update", { exact: true }).click();
    });

    test("should add key attributes to a new user", async ({ page }) => {
      await page
        .getByRole("button", { name: "Invite someone", exact: true })
        .click();

      const dialog = modal(page);
      await dialog.getByPlaceholder("Johnny", { exact: true }).fill("John");
      await dialog.getByPlaceholder("Appleseed", { exact: true }).fill("Smith");
      await dialog
        .getByPlaceholder("nicetoseeyou@email.com", { exact: true })
        .fill("john@smith.test");

      await dialog.getByText("Attributes", { exact: true }).click();
      await dialog.getByText("Add an attribute", { exact: true }).click();
      await dialog.getByPlaceholder("Key", { exact: true }).fill("User ID");
      await dialog.getByPlaceholder("Value", { exact: true }).fill("1");
      // cy.findAllByText("Create").click() — Cypress clicks a single-element
      // set here; .first() keeps that behaviour under strict mode.
      await dialog.getByText("Create", { exact: true }).first().click();
      await dialog.getByRole("button", { name: "Done", exact: true }).click();
    });
  });

  test.describe("normal user", () => {
    const USER_ATTRIBUTE = "User ID";
    const ATTRIBUTE_VALUE = "3";
    const TTAG_NAME = "cid";
    const QUESTION_NAME = "Joined test";

    let joinedQuestionId: number;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await preparePermissions(mb.api);

      // Add user attribute to existing ("normal" / id:2) user
      await mb.api.put(`/api/user/${NORMAL_USER_ID}`, {
        login_attributes: { [USER_ATTRIBUTE]: ATTRIBUTE_VALUE },
      });

      // Orders join Products
      const { card } = await createJoinedQuestion(mb.api, QUESTION_NAME);
      joinedQuestionId = card.id;

      await sandboxTable(mb.api, {
        table_id: ORDERS_ID,
        group_id: DATA_GROUP,
        attribute_remappings: {
          [USER_ATTRIBUTE]: ["dimension", ["field", ORDERS.USER_ID, null]],
        },
      });

      const sqlParam = await createNativeQuestion(mb.api, {
        name: "sql param",
        native: {
          query: `select id,name,address,email from people where {{${TTAG_NAME}}}`,
          "template-tags": {
            [TTAG_NAME]: {
              id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
              name: TTAG_NAME,
              "display-name": "CID",
              type: "dimension",
              dimension: ["field", PEOPLE.ID, null],
              "widget-type": "id",
            },
          },
        },
      });
      await sandboxTable(mb.api, {
        table_id: PEOPLE_ID,
        card_id: sqlParam.id,
        group_id: DATA_GROUP,
        attribute_remappings: {
          [USER_ATTRIBUTE]: ["dimension", ["template-tag", TTAG_NAME]],
        },
      });

      await mb.signOut();
      await mb.signInAsNormalUser();
    });

    test.describe("table sandboxed on a user attribute", () => {
      test("should display correct number of orders", async ({ page }) => {
        const dataset = await openTableCapturingDataset(page, {
          table: ORDERS_ID,
        });
        // 10 rows filtered on User ID
        await expect(
          page.getByText(ATTRIBUTE_VALUE, { exact: true }),
        ).toHaveCount(10);
        await assertDatasetReqIsSandboxed(dataset, {
          columnId: ORDERS.USER_ID,
          columnAssertion: Number(ATTRIBUTE_VALUE),
        });
      });
    });

    test.describe("question with joins", () => {
      test("should be sandboxed even after applying a filter to the question", async ({
        page,
      }) => {
        // Open saved question with joins
        await visitQuestionCapturingCardQuery(page, joinedQuestionId);

        // Make sure user is initially sandboxed
        await expect(firstColumnCells(page)).toHaveCount(10);

        // Add filter to a question
        await openNotebook(page);
        await filterNotebook(page);
        await popover(page).getByText("Total", { exact: true }).click();
        await selectFilterOperator(page, "Greater than");
        await popover(page)
          .getByPlaceholder("Enter a number", { exact: true })
          .fill("100");
        await popover(page)
          .getByRole("button", { name: "Add filter", exact: true })
          .click();

        const dataset = await visualize(page);
        // Make sure user is still sandboxed.
        //
        // NOTE: upstream passes `columnAssetion` (typo), so the column branch
        // of assertDatasetReqIsSandboxed never runs and only `is_sandboxed` is
        // checked. Kept verbatim — see the file header.
        await assertDatasetReqIsSandboxed(dataset);
        await expect(firstColumnCells(page)).toHaveCount(6);
      });
    });

    test.describe("table sandboxed on a saved parameterized SQL question", () => {
      test("should show filtered categories", async ({ page }) => {
        const dataset = await openTableCapturingDataset(page, {
          table: PEOPLE_ID,
        });
        await assertDatasetReqIsSandboxed(dataset, {
          columnId: PEOPLE.ID,
          columnAssertion: Number(ATTRIBUTE_VALUE),
        });
        await expect(page.getByTestId("header-cell")).toHaveCount(4);
        await expect(firstColumnCells(page)).toHaveCount(1);
      });
    });
  });

  test.describe("sandboxed user", () => {
    const allCategories = ["Gadget", "Gizmo", "Doohickey", "Widget"];

    async function verifyCategoryList(
      page: import("@playwright/test").Page,
      visibleCategories: string[],
    ) {
      const pop = popover(page);
      await expect(pop).toBeVisible();
      // Anchor first: upstream's loop runs the absence checks before the
      // presence check for the sandboxed users (allCategories is ordered with
      // "Widget"/"Gadget" last), which would let a not-yet-rendered list
      // satisfy every `not.exist`. Assert what MUST be there, then what must
      // not — same assertions, ordered so the absence half can't be vacuous.
      for (const value of visibleCategories) {
        await expect(pop.getByText(value, { exact: true })).toBeVisible();
      }
      for (const value of allCategories) {
        if (!visibleCategories.includes(value)) {
          await expect(pop.getByText(value, { exact: true })).toHaveCount(0);
        }
      }
    }

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await preparePermissions(mb.api);
    });

    test("should show field values for sandboxed users", async ({
      page,
      mb,
      context,
    }) => {
      // create another sandboxed user
      const user = {
        email: "u2@metabase.test",
        password: "12341234",
        login_attributes: {
          attr_uid: "2",
          attr_cat: "Gadget",
        },
        user_group_memberships: [
          { id: ALL_USERS_GROUP, is_group_manager: false },
          { id: COLLECTION_GROUP, is_group_manager: false },
        ],
      };
      await createUserFromRawData(mb.api, user);

      // setup sandboxing
      await page.goto(
        `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${PRODUCTS_ID}`,
      );
      await modifyPermission(page, "collection", 0, "Row and column security");
      await modal(page).getByText("Pick a column", { exact: true }).click();
      await popover(page).getByText("Category", { exact: true }).click();
      await modal(page)
        .getByPlaceholder("Pick a user attribute", { exact: true })
        .click();
      await popover(page).getByText("attr_cat", { exact: true }).click();
      await modal(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await savePermissions(page);

      // setup a dashboard
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await editDashboard(page);
      await setFilter(page, "Text or Category", "Is");
      await selectDashboardFilter(getDashboardCard(page), "Category");
      await saveDashboard(page);

      // field values for admin
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await filterWidget(page).click();
      await verifyCategoryList(page, allCategories);

      // field values for the first sandboxed user
      await mb.signIn("sandboxed");
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await filterWidget(page).click();
      await verifyCategoryList(page, ["Widget"]);

      // field values for the second sandboxed user
      const userApi = await signInWithCredentials(
        context,
        mb.api,
        { username: user.email, password: user.password },
        mb.baseUrl,
      );
      await visitDashboard(page, userApi, ORDERS_DASHBOARD_ID);
      await filterWidget(page).click();
      await verifyCategoryList(page, ["Gadget"]);
    });
  });

  test.describe("Sandboxing reproductions", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await preparePermissions(mb.api);
    });

    test("should allow using a dashboard question as a sandbox source", async ({
      page,
      mb,
    }) => {
      const USER_ATTRIBUTE = "User ID";
      const ATTRIBUTE_VALUE = "3";
      const TTAG_NAME = "cid";
      const QUESTION_NAME = "Joined test";

      // Add user attribute to existing ("normal" / id:2) user
      await mb.api.put(`/api/user/${NORMAL_USER_ID}`, {
        login_attributes: { [USER_ATTRIBUTE]: ATTRIBUTE_VALUE },
      });

      // Orders join Products
      await createJoinedQuestion(mb.api, QUESTION_NAME);

      await sandboxTable(mb.api, {
        table_id: ORDERS_ID,
        group_id: DATA_GROUP,
        attribute_remappings: {
          [USER_ATTRIBUTE]: ["dimension", ["field", ORDERS.USER_ID, null]],
        },
      });

      const sqlParam = await createNativeQuestion(mb.api, {
        name: "sql param in a dashboard",
        dashboard_id: ORDERS_DASHBOARD_ID,
        native: {
          query: `select id,name,address,email from people where {{${TTAG_NAME}}}`,
          "template-tags": {
            [TTAG_NAME]: {
              id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
              name: TTAG_NAME,
              "display-name": "CID",
              type: "dimension",
              dimension: ["field", PEOPLE.ID, null],
              "widget-type": "id",
            },
          },
        },
      });
      await sandboxTable(mb.api, {
        table_id: PEOPLE_ID,
        card_id: sqlParam.id,
        group_id: DATA_GROUP,
        attribute_remappings: {
          [USER_ATTRIBUTE]: ["dimension", ["template-tag", TTAG_NAME]],
        },
      });

      await mb.signOut();
      await mb.signInAsNormalUser();

      // see that the question is in the dashboard
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        dashboardCards(page).getByText("sql param in a dashboard", {
          exact: true,
        }),
      ).toBeAttached();

      const dataset = await openTableCapturingDataset(page, {
        table: PEOPLE_ID,
      });
      // 1 row filtered on User ID
      await expect(
        page.getByText(ATTRIBUTE_VALUE, { exact: true }),
      ).toHaveCount(1);
      // NOTE: PEOPLE.USER_ID does not exist (undefined), so upstream's column
      // assertion is inert and only `is_sandboxed` is checked. Kept verbatim —
      // see the file header.
      await assertDatasetReqIsSandboxed(dataset, {
        columnId: (PEOPLE as Record<string, number>).USER_ID,
        columnAssertion: Number(ATTRIBUTE_VALUE),
      });
    });

    test("should allow joins to the sandboxed table (metabase-enterprise#154)", async ({
      page,
      mb,
    }) => {
      await updatePermissionsGraph(mb.api, {
        [COLLECTION_GROUP]: {
          [SAMPLE_DB_ID]: {
            "view-data": "unrestricted",
            "create-queries": {
              PUBLIC: {
                [ORDERS_ID]: "query-builder",
                [PRODUCTS_ID]: "query-builder",
                [REVIEWS_ID]: "query-builder",
              },
            },
          },
        },
      });

      await sandboxTable(mb.api, {
        table_id: PEOPLE_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field", PEOPLE.ID, null]],
        },
      });

      await mb.signOut();
      await mb.signInAsSandboxedUser();

      await openOrdersTable(page, { mode: "notebook" });
      await summarizeNotebook(page);
      await page.getByText("Count of rows", { exact: true }).click();
      await page.getByText("Pick a column to group by", { exact: true }).click();

      // Original issue reported failure to find 'User' group / foreign key
      const pop = popover(page);
      // Collapse "Order/s/" in order to bring "User" into view (trick to get
      // around virtualization - credits: @flamber)
      await pop
        .locator("[data-element-id=list-section-header]")
        .filter({ hasText: /Orders?/ })
        .first()
        .click();
      await pop
        .locator("[data-element-id=list-section-header]")
        .filter({ hasText: /User/ })
        .first()
        .click();
      await pop
        .locator("[data-element-id=list-item]")
        .filter({ hasText: /ID/ })
        .first()
        .click();

      const dataset = await visualize(page);

      await expect(
        page.getByText("Count by User → ID", { exact: true }).first(),
      ).toBeVisible();
      // Sum of orders for user with ID #1
      await expect(page.getByText("11", { exact: true }).first()).toBeVisible();
      // test that user is sandboxed - normal users has over 2000 rows
      await assertQueryBuilderRowCount(page, 2);
      await assertDatasetReqIsSandboxed(dataset);
    });

    // Note: This issue was ported from EE repo - it was previously known as
    // (metabase-enterprise#548)
    test("SB question with `case` CC should substitute the `else` argument's table (metabase#14859)", async ({
      page,
      mb,
    }) => {
      const QUESTION_NAME = "EE_548";
      const CC_NAME = "CC_548"; // Custom column

      await sandboxTable(mb.api, {
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
        },
      });

      const card = await createQuestion(mb.api, {
        name: QUESTION_NAME,
        query: {
          expressions: {
            [CC_NAME]: [
              "case",
              [
                [
                  [">", ["field", ORDERS.DISCOUNT, null], 0],
                  ["field", ORDERS.DISCOUNT],
                  // no idea why this is here, a `case` subclause only has two
                  // args, this actually makes this invalid.
                  null,
                ],
              ],
              { default: ["field", ORDERS.TOTAL, null] },
            ],
          },
          "source-table": ORDERS_ID,
        },
      });

      await mb.signOut();
      await mb.signInAsSandboxedUser();

      // Assertion phase starts here
      const cardQuery = await visitQuestionCapturingCardQuery(page, card.id);
      await expect(
        page.getByText(QUESTION_NAME, { exact: true }).first(),
      ).toBeVisible();

      // Reported failing since v1.36.4
      await expect(page.getByText(CC_NAME).first()).toBeVisible();
      // test that user is sandboxed - normal users has over 2000 rows
      await assertQueryBuilderRowCount(page, 11);
      await assertDatasetReqIsSandboxed(cardQuery, {
        columnId: ORDERS.USER_ID,
        columnAssertion: SANDBOXED_ATTR_UID,
      });
    });

    for (const variant of ["remapped", "default"] as const) {
      test(`${variant.toUpperCase()} version:\n drill-through should work on implicit joined tables with sandboxes (metabase#13641)`, async ({
        page,
        mb,
      }) => {
        const QUESTION_NAME = "13641";

        if (variant === "remapped") {
          // Remap Product ID's display value to `title`
          await remapDisplayValueToFK(mb.api, {
            display_value: ORDERS.PRODUCT_ID,
            name: "Product ID",
            fk: PRODUCTS.TITLE,
          });
        }

        await updatePermissionsGraph(mb.api, {
          [COLLECTION_GROUP]: {
            [SAMPLE_DB_ID]: {
              "view-data": {
                PUBLIC: {
                  [PRODUCTS_ID]: "unrestricted",
                },
              },
              "create-queries": {
                PUBLIC: {
                  [PRODUCTS_ID]: "query-builder",
                },
              },
            },
          },
        });

        await sandboxTable(mb.api, {
          table_id: ORDERS_ID,
          attribute_remappings: {
            attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
          },
        });

        // Create question based on steps in
        // https://github.com/metabase/metabase/issues/13641
        const card = await createQuestion(mb.api, {
          name: QUESTION_NAME,
          query: {
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
            ],
            "source-table": ORDERS_ID,
          },
          display: "bar",
        });

        await mb.signOut();
        await mb.signInAsSandboxedUser();

        // Find saved question in "Our analytics"
        const cardQuery = page.waitForResponse((response) =>
          isCardQueryResponse(response, card.id),
        );
        await page.goto("/collection/root");
        await page.getByText(QUESTION_NAME, { exact: true }).click();
        await cardQuery;

        // Drill-through: click on the first bar in a graph
        // (Category: "Doohickey")
        const dataset = page.waitForResponse(isDatasetResponse);
        await chartPathWithFillColor(
          page.getByTestId("query-visualization-root"),
          "#509EE3",
        )
          .nth(0)
          .click();
        await page.getByText("See these Orders", { exact: true }).click();

        // Reported failing on v1.37.0.2
        const datasetResponse = await dataset;
        expect(((await datasetResponse.json()) as { error?: unknown }).error).toBeFalsy();

        await expect(
          page
            .getByText("Product → Category is Doohickey", { exact: true })
            .first(),
        ).toBeVisible();
        // Subtotal for order #10
        await expect(
          page.getByText("97.44", { exact: true }).first(),
        ).toBeVisible();
        // test that user is sandboxed - normal users has over 2000 rows
        await assertQueryBuilderRowCount(page, 2);
        await assertDatasetReqIsSandboxed(datasetResponse, {
          columnId: ORDERS.USER_ID,
          columnAssertion: SANDBOXED_ATTR_UID,
        });
      });
    }

    test("should allow drill-through for sandboxed user (metabase-enterprise#535)", async ({
      page,
      mb,
    }) => {
      const PRODUCTS_ALIAS = "Products";
      const QUESTION_NAME = "EE_535";

      await updatePermissionsGraph(mb.api, {
        [COLLECTION_GROUP]: {
          [SAMPLE_DB_ID]: {
            "view-data": "unrestricted",
            "create-queries": {
              PUBLIC: {
                [PRODUCTS_ID]: "query-builder",
              },
            },
          },
        },
      });

      await sandboxTable(mb.api, {
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
        },
      });

      // Create question based on steps in
      // https://github.com/metabase/metabase-enterprise/issues/535
      const card = await createQuestion(mb.api, {
        name: QUESTION_NAME,
        query: {
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "join-alias": PRODUCTS_ALIAS }],
          ],
          joins: [
            {
              alias: PRODUCTS_ALIAS,
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": PRODUCTS_ALIAS }],
              ],
              fields: "all",
              "source-table": PRODUCTS_ID,
            },
          ],
          "source-table": ORDERS_ID,
        },
        display: "bar",
      });

      await mb.signOut();
      await mb.signInAsSandboxedUser();

      // Find saved question in "Our analytics"
      const cardQuery = page.waitForResponse((response) =>
        isCardQueryResponse(response, card.id),
      );
      await page.goto("/collection/root");
      await page.getByText(QUESTION_NAME, { exact: true }).click();
      await cardQuery;

      // Drill-through: click on the first bar in a graph (Category: "Doohickey")
      const dataset = page.waitForResponse(isDatasetResponse);
      await chartPathWithFillColor(
        page.getByTestId("query-visualization-root"),
        "#509EE3",
      )
        .nth(0)
        .click();
      await page.getByText("See these Orders", { exact: true }).click();
      const datasetResponse = await dataset;

      // Reported failing on v1.36.4
      await expect(
        page
          .getByText("Products → Category is Doohickey", { exact: true })
          .first(),
      ).toBeVisible();
      // Subtotal for order #10
      await expect(
        page.getByText("97.44", { exact: true }).first(),
      ).toBeVisible();
      // test that user is sandboxed - normal users has over 2000 rows
      await assertQueryBuilderRowCount(page, 2);
      await assertDatasetReqIsSandboxed(datasetResponse, {
        columnId: ORDERS.USER_ID,
        columnAssertion: SANDBOXED_ATTR_UID,
      });
    });

    test.describe("with display values remapped to use a foreign key", () => {
      test.beforeEach(async ({ mb }) => {
        // Remap Product ID's display value to `title`
        await remapDisplayValueToFK(mb.api, {
          display_value: ORDERS.PRODUCT_ID,
          name: "Product ID",
          fk: PRODUCTS.TITLE,
        });
      });

      /**
       * There isn't an exact issue that this test reproduces, but it is
       * basically a version of (metabase-enterprise#520) that uses a query
       * builder instead of SQL based questions.
       */
      test("should be able to sandbox using query builder saved questions", async ({
        page,
        mb,
      }) => {
        // Create 'Orders'-based question using QB
        const ordersCard = await createQuestion(mb.api, {
          name: "520_Orders",
          query: {
            "source-table": ORDERS_ID,
            filter: [">", ["field", ORDERS.TOTAL, null], 10],
          },
        });
        await sandboxTable(mb.api, {
          table_id: ORDERS_ID,
          card_id: ordersCard.id,
          attribute_remappings: {
            attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
          },
        });

        // Create 'Products'-based question using QB
        const productsCard = await createQuestion(mb.api, {
          name: "520_Products",
          query: {
            "source-table": PRODUCTS_ID,
            filter: [">", ["field", PRODUCTS.PRICE, null], 10],
          },
        });
        await sandboxTable(mb.api, {
          table_id: PRODUCTS_ID,
          card_id: productsCard.id,
          attribute_remappings: {
            attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
          },
        });

        await mb.signOut();
        await mb.signInAsSandboxedUser();

        const dataset = await openTableCapturingDataset(page, {
          table: ORDERS_ID,
        });
        expect(((await dataset.json()) as { error?: unknown }).error).toBeFalsy();

        // test that user is sandboxed - normal users has over 2000 rows
        await assertQueryBuilderRowCount(page, 11);
        await assertDatasetReqIsSandboxed(dataset, {
          columnId: ORDERS.USER_ID,
          columnAssertion: SANDBOXED_ATTR_UID,
        });

        await tableInteractive(page)
          .getByText("Awesome Concrete Shoes", { exact: true })
          .first()
          .click();
        await popover(page).getByText(/View details/i).click();

        // It should show object details instead of filtering by this Product ID
        await expect(page.getByTestId("object-detail")).toBeAttached();
        // The name of this Vendor is visible in "details" only
        await expect(
          page.getByText("McClure-Lockman", { exact: true }).first(),
        ).toBeVisible();
      });

      test("Advanced sandboxing should not ignore data model features like object detail of FK (metabase-enterprise#520)", async ({
        page,
        mb,
      }) => {
        /** Helper function related to this test only! */
        async function runQuestion({
          question,
          sandboxValue,
        }: {
          question: number;
          sandboxValue: string;
        }) {
          // Run the question
          const cardQuery = page.waitForResponse((response) =>
            isCardQueryResponse(response, question),
          );
          await page.goto(`/question/${question}?sandbox=${sandboxValue}`);
          // Wait for results
          await cardQuery;
        }

        const q1 = await createNativeQuestion(mb.api, {
          name: "EE_520_Q1",
          native: {
            query: "SELECT * FROM ORDERS WHERE USER_ID={{sandbox}} AND TOTAL > 10",
            "template-tags": {
              sandbox: {
                "display-name": "Sandbox",
                id: "1115dc4f-6b9d-812e-7f72-b87ab885c88a",
                name: "sandbox",
                type: "number",
                default: "1",
              },
            },
          },
        });
        await runQuestion({ question: q1.id, sandboxValue: "1" });
        await sandboxTable(mb.api, {
          table_id: ORDERS_ID,
          card_id: q1.id,
          attribute_remappings: {
            attr_uid: ["variable", ["template-tag", "sandbox"]],
          },
        });

        const q2 = await createNativeQuestion(mb.api, {
          name: "EE_520_Q2",
          native: {
            query:
              "SELECT * FROM PRODUCTS WHERE CATEGORY={{sandbox}} AND PRICE > 10",
            "template-tags": {
              sandbox: {
                "display-name": "Sandbox",
                id: "3d69ba99-7076-2252-30bd-0bb8810ba895",
                name: "sandbox",
                type: "text",
                default: "Widget",
              },
            },
          },
        });
        await runQuestion({ question: q2.id, sandboxValue: "Widget" });
        await sandboxTable(mb.api, {
          table_id: PRODUCTS_ID,
          card_id: q2.id,
          attribute_remappings: {
            attr_cat: ["variable", ["template-tag", "sandbox"]],
          },
        });

        await mb.signOut();
        await mb.signInAsSandboxedUser();

        await openOrdersTable(page);

        // Reported failing on v1.36.x
        // It should show remapped Display Values instead of Product ID
        await page
          .getByTestId("cell-data")
          .filter({ hasText: "Awesome Concrete Shoes" })
          .first()
          .click();
        await page.getByText(/View details/i).first().click();

        // It should show object details instead of filtering by this Product ID
        await expect(page.getByTestId("object-detail")).toBeAttached();
        // The name of this Vendor is visible in "details" only
        await expect(
          page.getByText("McClure-Lockman", { exact: true }).first(),
        ).toBeVisible();
      });

      test("simple sandboxing should work (metabase#14629)", async ({
        page,
        mb,
      }) => {
        await updatePermissionsGraph(mb.api, {
          [COLLECTION_GROUP]: {
            [SAMPLE_DB_ID]: {
              "view-data": {
                PUBLIC: {
                  [PRODUCTS_ID]: "unrestricted",
                },
              },
            },
          },
        });

        await sandboxTable(mb.api, {
          table_id: ORDERS_ID,
          attribute_remappings: {
            attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
          },
        });

        await mb.signOut();
        await mb.signInAsSandboxedUser();
        const dataset = await openTableCapturingDataset(page, {
          table: ORDERS_ID,
        });
        expect(((await dataset.json()) as { error?: unknown }).error).toBeFalsy();
        // test that user is sandboxed - normal users has over 2000 rows
        await assertQueryBuilderRowCount(page, 11);
        await assertDatasetReqIsSandboxed(dataset, {
          columnId: ORDERS.USER_ID,
          columnAssertion: SANDBOXED_ATTR_UID,
        });

        // Title of the first order for User ID = 1
        await expect(
          page.getByText("Awesome Concrete Shoes", { exact: true }).first(),
        ).toBeVisible();

        await mb.signOut();
        await mb.signInAsAdmin();
        await page.goto(
          "/admin/permissions/data/group/3/database/1/schema/PUBLIC/5/segmented",
        );
      });
    });

    for (const variant of ["remapped", "default"] as const) {
      test(`${variant.toUpperCase()} version:\n should work on questions with joins, with sandboxed target table, where target fields cannot be filtered (metabase#13642)`, async ({
        page,
        mb,
      }) => {
        const QUESTION_NAME = "13642";
        const PRODUCTS_ALIAS = "Products";

        if (variant === "remapped") {
          // Remap Product ID's display value to `title`
          await remapDisplayValueToFK(mb.api, {
            display_value: ORDERS.PRODUCT_ID,
            name: "Product ID",
            fk: PRODUCTS.TITLE,
          });
        }

        await sandboxTable(mb.api, {
          table_id: ORDERS_ID,
          attribute_remappings: {
            attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
          },
        });

        await sandboxTable(mb.api, {
          table_id: PRODUCTS_ID,
          attribute_remappings: {
            attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
          },
        });

        const card = await createQuestion(mb.api, {
          name: QUESTION_NAME,
          query: {
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CATEGORY, { "join-alias": PRODUCTS_ALIAS }],
            ],
            joins: [
              {
                fields: "all",
                "source-table": PRODUCTS_ID,
                condition: [
                  "=",
                  ["field", ORDERS.PRODUCT_ID, null],
                  ["field", PRODUCTS.ID, { "join-alias": PRODUCTS_ALIAS }],
                ],
                alias: PRODUCTS_ALIAS,
              },
            ],
            "source-table": ORDERS_ID,
          },
          display: "bar",
        });

        await mb.signOut();
        await mb.signInAsSandboxedUser();

        const cardQueryPromise = page.waitForResponse((response) =>
          isCardQueryResponse(response, card.id),
        );
        await page.goto("/collection/root");
        await page.getByText(QUESTION_NAME, { exact: true }).click();
        const cardQuery = await cardQueryPromise;

        // test that user is sandboxed - normal users has 4
        await assertQueryBuilderRowCount(page, 2);
        await assertDatasetReqIsSandboxed(cardQuery);

        // Drill-through: click on the second bar in a graph (Category: "Widget")
        const datasetPromise = page.waitForResponse(isDatasetResponse);
        await chartPathWithFillColor(
          page.getByTestId("query-visualization-root"),
          "#509EE3",
        )
          .nth(1)
          .click();
        await page.getByText("See these Orders", { exact: true }).click();
        const dataset = await datasetPromise;

        expect(((await dataset.json()) as { error?: unknown }).error).toBeFalsy();

        await expect(page.getByText("37.65").first()).toBeVisible();
        // test that user is sandboxed - normal users has over 2000
        await assertQueryBuilderRowCount(page, 6);
        await assertDatasetReqIsSandboxed(dataset);
      });
    }

    test("attempt to sandbox based on question with differently-typed columns than a sandboxed table should provide meaningful UI error (metabase#14612)", async ({
      page,
      mb,
    }) => {
      const QUESTION_NAME = "Different type";
      const ERROR_MESSAGE =
        "Sandbox Questions can't return columns that have different types than the Table they are sandboxing.";

      // Question with differently-typed columns than the sandboxed table
      await createNativeQuestion(mb.api, {
        name: QUESTION_NAME,
        native: { query: "SELECT CAST(ID AS VARCHAR) AS ID FROM ORDERS;" },
      });

      const tablePermissions = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/permissions/group",
      );
      await page.goto(
        `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}`,
      );
      await tablePermissions;

      await icon(page, "eye")
        // No better way of doing this, unfortunately (see table above)
        .nth(1)
        .click();
      await popover(page)
        .getByText("Row and column security", { exact: true })
        .click();
      await page.getByRole("button", { name: "Change", exact: true }).click();
      await modal(page)
        .getByText("Use a saved question to create a custom view for this table", {
          exact: true,
        })
        .click();

      await modal(page).getByText("Select a question", { exact: true }).click();

      await pickEntity(page, {
        path: ["Our analytics", QUESTION_NAME],
        select: true,
      });

      const sandboxValidation = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/mt/gtap/validate",
      );
      await modal(page).getByRole("button", { name: "Save", exact: true }).click();
      const validation = await sandboxValidation;
      expect(validation.status()).toBe(400);
      expect(((await validation.json()) as { message: string }).message).toBe(
        ERROR_MESSAGE,
      );

      await modal(page).evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(
        modal(page).getByText(ERROR_MESSAGE, { exact: true }),
      ).toBeVisible();
    });

    test("should be able to use summarize columns from joined table based on a saved question (metabase#14766)", async ({
      page,
      mb,
    }) => {
      await createJoinedQuestion(mb.api, "14766_joined");

      await startNewQuestion(page);
      await miniPicker(page)
        .getByText("Our analytics", { exact: true })
        .click();
      await miniPicker(page)
        .getByText("14766_joined", { exact: true })
        .click();
      await page.getByText("Pick a function or metric", { exact: true }).click();
      await page.getByText("Count of rows", { exact: true }).click();
      await page.getByText("Pick a column to group by", { exact: true }).click();
      await page
        .getByText(/Products? → ID/)
        .first()
        .click();

      const dataset = await visualize(page);
      expect(((await dataset.json()) as { error?: unknown }).error).toBeFalsy();

      // Number of products with ID = 1 (and ID = 19)
      await expect(page.getByText("93", { exact: true }).first()).toBeVisible();
    });

    test("should be able to remove columns via QB sidebar / settings (metabase#14841)", async ({
      page,
      mb,
    }) => {
      await sandboxTable(mb.api, {
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
      });

      await sandboxTable(mb.api, {
        table_id: PRODUCTS_ID,
        attribute_remappings: {
          attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
        },
      });

      await mb.signOut();
      await mb.signInAsSandboxedUser();
      const { cardQuery } = await createJoinedQuestion(mb.api, "14841", {
        page,
        visitQuestion: true,
      });

      await openVizSettingsSidebar(page);
      const leftSidebar = page.getByTestId("sidebar-left");
      await expect(leftSidebar).toBeVisible();
      // Remove the "Subtotal" column from within sidebar.
      // Cypress's {force:true} dispatches at the resolved element; Playwright's
      // moves the real mouse, so dispatchEvent is the faithful equivalent.
      await icon(
        leftSidebar.getByTestId("draggable-item-Subtotal"),
        "eye_outline",
      ).dispatchEvent("click");

      await page.getByRole("button", { name: "Done", exact: true }).click();

      // Anchor the absence checks. `sidebar-left` is the QB's always-mounted
      // left rail, so its presence proves nothing; the settings panel's own
      // "Done" button disappearing proves the click was applied, and the table
      // being painted proves the results are rendered. Without both, the two
      // `toHaveCount(0)`s below could pass on an unsettled page.
      await expect(
        page.getByRole("button", { name: "Done", exact: true }),
      ).toHaveCount(0);
      await expect(tableInteractive(page)).toBeVisible();
      await expect(page.getByText("Subtotal")).toHaveCount(0);
      await expect(page.getByText("37.65")).toHaveCount(0);
      // test that user is sandboxed - normal users has over 2000 rows
      await assertQueryBuilderRowCount(page, 11);
      await assertDatasetReqIsSandboxed(cardQuery!, {
        columnId: ORDERS.USER_ID,
        columnAssertion: SANDBOXED_ATTR_UID,
      });
    });

    test("should work with pivot tables (metabase#14969)", async ({
      page,
      mb,
    }) => {
      await sandboxTable(mb.api, {
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
      });

      await sandboxTable(mb.api, {
        table_id: PEOPLE_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", PEOPLE.ID]],
        },
      });

      await sandboxTable(mb.api, {
        table_id: PRODUCTS_ID,
        attribute_remappings: {
          attr_cat: ["dimension", ["field-id", PRODUCTS.CATEGORY]],
        },
      });

      const response = await mb.api.post("/api/card/", {
        name: "14969",
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                fields: "all",
                "source-table": PEOPLE_ID,
                condition: [
                  "=",
                  ["field-id", ORDERS.USER_ID],
                  ["joined-field", "People - User", ["field-id", PEOPLE.ID]],
                ],
                alias: "People - User",
              },
            ],
            aggregation: [["sum", ["field-id", ORDERS.TOTAL]]],
            breakout: [
              ["joined-field", "People - User", ["field-id", PEOPLE.SOURCE]],
              [
                "fk->",
                ["field-id", ORDERS.PRODUCT_ID],
                ["field-id", PRODUCTS.CATEGORY],
              ],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "pivot",
        visualization_settings: {},
      });
      const { id: questionId } = (await response.json()) as { id: number };

      await mb.signOut();
      await mb.signInAsSandboxedUser();

      const cardQuery = await visitQuestionCapturingCardQuery(page, questionId);
      await assertDatasetReqIsSandboxed(cardQuery);

      await expect(
        page.getByText("Twitter", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByText("Row totals", { exact: true }).first(),
      ).toBeVisible();
      // test that user is sandboxed - normal users has 30
      await assertQueryBuilderRowCount(page, 6);
    });

    test("should show dashboard subscriptions for sandboxed user (metabase#14990)", async ({
      page,
      mb,
    }) => {
      // Upstream calls H.setupSMTP(); the test only needs email CONFIGURED
      // (it asserts the subscription sidebar forwards to email), never reads
      // the inbox — so the non-validating settings write is enough and keeps
      // the test off the maildev container.
      await configureSmtpSettings(mb.api);

      await sandboxTable(mb.api, {
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
      });

      await mb.signInAsSandboxedUser();
      const dashcardQuery = page.waitForResponse((response) =>
        isDashcardQueryResponse(response, ORDERS_DASHBOARD_DASHCARD_ID),
      );
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      const dashcardResponse = await dashcardQuery;

      await openDashboardMenu(page, "Subscriptions");

      // should forward to email since that is the only one setup
      await expect(
        sidebar(page).getByText("Email this dashboard", { exact: true }),
      ).toBeAttached();

      // test that user is sandboxed - normal users has over 2000 rows
      await assertTableRowsCount(getDashboardCard(page), 11);
      await assertDatasetReqIsSandboxed(dashcardResponse, {
        columnId: ORDERS.USER_ID,
        columnAssertion: SANDBOXED_ATTR_UID,
      });
    });

    test("should be able to visit ad-hoc/dirty question when permission is granted to the linked table column, but not to the linked table itself (metabase#15105)", async ({
      page,
      mb,
    }) => {
      await sandboxTable(mb.api, {
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: [
            "dimension",
            ["fk->", ["field-id", ORDERS.USER_ID], ["field-id", PEOPLE.ID]],
          ],
        },
      });

      await mb.signOut();
      await mb.signInAsSandboxedUser();

      const dataset = await openTableCapturingDataset(page, {
        table: ORDERS_ID,
      });
      expect(((await dataset.json()) as { error?: unknown }).error).toBeFalsy();

      await expect(page.getByText("37.65").first()).toBeVisible();
    });

    test("unsaved/dirty query should work on linked table column with multiple dimensions and remapping (metabase#15106)", async ({
      page,
      mb,
    }) => {
      await remapDisplayValueToFK(mb.api, {
        display_value: ORDERS.USER_ID,
        name: "User ID",
        fk: PEOPLE.NAME,
      });

      // Remap REVIEWS.PRODUCT_ID Field Type to ORDERS.ID
      await mb.api.put(`/api/field/${REVIEWS.PRODUCT_ID}`, {
        table_id: REVIEWS_ID,
        special_type: "type/FK",
        name: "PRODUCT_ID",
        fk_target_field_id: ORDERS.ID,
        display_name: "Product ID",
      });

      await sandboxTable(mb.api, {
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
      });

      await sandboxTable(mb.api, {
        table_id: PEOPLE_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", PEOPLE.ID]],
        },
      });

      await sandboxTable(mb.api, {
        table_id: REVIEWS_ID,
        attribute_remappings: {
          attr_uid: [
            "dimension",
            [
              "fk->",
              ["field-id", REVIEWS.PRODUCT_ID],
              ["field-id", ORDERS.USER_ID],
            ],
          ],
        },
      });
      await mb.signOut();
      await mb.signInAsSandboxedUser();

      const dataset = await openTableCapturingDataset(page, {
        table: REVIEWS_ID,
      });
      expect(((await dataset.json()) as { error?: unknown }).error).toBeFalsy();
      // test that user is sandboxed - normal users has 1,112 rows
      await assertQueryBuilderRowCount(page, 57);
      await assertDatasetReqIsSandboxed(dataset);

      // Add positive assertion once this issue is fixed
    });

    test("sandboxed user should receive sandboxed dashboard subscription", async ({
      page,
      mb,
    }) => {
      // @external in Cypress: this is the one test in the file that READS the
      // inbox, so it needs the real maildev container (SMTP :1025, web :1080).
      test.skip(
        !(await isMaildevRunning()),
        "needs the maildev container (docker: maildev/maildev:2.x)",
      );
      await setupSMTP(mb.api);

      await sandboxTable(mb.api, {
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
        },
      });

      await mb.signOut();
      await mb.signInAsSandboxedUser();

      const dashcardQuery = page.waitForResponse((response) =>
        isDashcardQueryResponse(response, ORDERS_DASHBOARD_DASHCARD_ID),
      );
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      const dashcardResponse = await dashcardQuery;

      // test that user is sandboxed - normal users has over 2000 rows
      await assertTableRowsCount(getDashboardCard(page), 11);

      await assertDatasetReqIsSandboxed(dashcardResponse, {
        columnId: ORDERS.USER_ID,
        columnAssertion: SANDBOXED_ATTR_UID,
      });

      await openDashboardMenu(page, "Subscriptions");

      await sidebar(page)
        .getByPlaceholder("Enter user names or email addresses", { exact: true })
        .click();
      await popover(page).getByText("User 1", { exact: true }).click();

      const email = await sendEmailAndGetFirst(page);
      expect(email.html).toContain("Orders in a dashboard");
      expect(email.html).toContain("37.65");
      // Order for user with ID 3
      expect(email.html).not.toContain("148.23");
    });

    test.describe("sandbox target matching", () => {
      async function verifySandboxModal(
        page: import("@playwright/test").Page,
        api: import("../support/api").MetabaseApi,
        target: unknown,
      ) {
        await sandboxTable(api, {
          table_id: PRODUCTS_ID,
          group_id: DATA_GROUP,
          attribute_remappings: {
            attr_cat: target,
          },
        });
        await page.goto(
          `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${PRODUCTS_ID}`,
        );
        await selectPermissionRow(page, "data", VIEW_DATA_PERMISSION_INDEX);
        await popover(page)
          .getByText("Edit row and column security", { exact: true })
          .click();
        await modal(page)
          .getByTestId("select-button")
          .filter({ hasText: "Category" })
          .first()
          .click();
        await expect(
          popover(page).getByLabel("Category", { exact: true }),
        ).toHaveAttribute("aria-selected", "true");
      }

      test("should match targets without dimension of field ref options", async ({
        page,
        mb,
      }) => {
        await verifySandboxModal(page, mb.api, [
          "dimension",
          ["field", PRODUCTS.CATEGORY, null],
        ]);
      });

      test("should match targets with dimension options", async ({
        page,
        mb,
      }) => {
        await verifySandboxModal(page, mb.api, [
          "dimension",
          ["field", PRODUCTS.CATEGORY, null],
          { "stage-number": 0 },
        ]);
      });

      test("should match targets with field ref options", async ({
        page,
        mb,
      }) => {
        await verifySandboxModal(page, mb.api, [
          "dimension",
          ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
          { "stage-number": 0 },
        ]);
      });
    });
  });

  test.describe("Column-restricting sandbox: hide hidden columns in the Data Reference UI", () => {
    // The sandbox source card exposes only a subset of the sandboxed table's
    // columns. Pure-API assertions for the metadata endpoints live in the
    // backend test metabase-enterprise.sandbox.api.database-test; add UI repros
    // here as it() cases.

    const PEOPLE_VISIBLE_COLS = ["ID", "NAME", "EMAIL"];
    const PEOPLE_HIDDEN_COLS = Object.keys(PEOPLE).filter(
      (name) => !PEOPLE_VISIBLE_COLS.includes(name),
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await preparePermissions(mb.api);

      // Sandbox PEOPLE with a native query exposing only PEOPLE_VISIBLE_COLS;
      // every other column (PEOPLE_HIDDEN_COLS) must be hidden everywhere.
      const card = await createNativeQuestion(mb.api, {
        name: "Sandbox source — people subset",
        native: {
          query: `SELECT ${PEOPLE_VISIBLE_COLS.join(", ")} FROM people`,
        },
      });
      await sandboxTable(mb.api, {
        table_id: PEOPLE_ID,
        card_id: card.id,
        group_id: COLLECTION_GROUP,
      });

      await mb.signOut();
      await mb.signInAsSandboxedUser();
    });

    test("Data Reference field list excludes sandbox-hidden columns", async ({
      page,
    }) => {
      await page.goto(
        `/reference/databases/${SAMPLE_DB_ID}/tables/${PEOPLE_ID}/fields`,
      );
      const scope = main(page);
      // H.main().within(...) carries an implicit existence assertion on the
      // scope — make it explicit so the absence half below can't pass on an
      // unrendered page.
      await expect(scope).toBeVisible();
      // Each field renders its display name and its raw column name, so a
      // visible column like ID appears more than once — use the first match.
      for (const name of PEOPLE_VISIBLE_COLS) {
        await expect(
          scope.getByText(name, { exact: true }).first(),
        ).toBeAttached();
      }
      for (const name of PEOPLE_HIDDEN_COLS) {
        await expect(scope.getByText(name, { exact: true })).toHaveCount(0);
      }
    });
  });
});
