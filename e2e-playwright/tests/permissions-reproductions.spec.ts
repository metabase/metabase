/**
 * Playwright port of
 * e2e/test/scenarios/permissions/permissions-reproductions.cy.spec.ts
 *
 * A grab-bag of permissions bug repros; every issue number is preserved as its
 * own describe block (11994, 39221, 76710).
 *
 * Port notes:
 * - No new helpers were needed — everything is reused read-only from shared
 *   modules: createQuestion (factories), visitQuestion/icon (ui),
 *   openReviewsTable (ad-hoc-question), tableInteractive (models),
 *   tableHeaderColumn (notebook), updatePermissionsGraph/ALL_USERS_GROUP
 *   (dashboard-repros), signInWithCachedSession (permissions).
 * - cy.updatePermissionsGraph → the GET-merge-PUT API port (PORTING: permission
 *   graph via API). DataPermission/DataPermissionValue enums inlined as their
 *   string values ("view-data"/"create-queries", "unrestricted"/"blocked"/
 *   "query-builder"), matching the values already used in dashboard-repros.ts.
 * - issue 39221: cy.intercept("/api/setting").as("siteSettings") +
 *   cy.get("@siteSettings").should("be.null") ports to a page.on("response")
 *   flag asserted false — the endpoint (exact pathname "/api/setting", the
 *   admin all-settings fetch) must never fire. The @sessionProperties wait is
 *   registered before the "View SQL" click that triggers it (PORTING rule 2).
 * - issue 76710 calls activateToken("pro-self-hosted") and is gated with
 *   resolveToken (PORTING rule 7); the jar activates the token. cy.signIn("none")
 *   → signInWithCachedSession (the "none" user isn't in the typed USERS map);
 *   the permission-graph writes in beforeEach still run as admin via mb.api.
 * - findByLabelText("View SQL") string → getByLabel({ exact: true }) (rule 1);
 *   findByText(/Save/) stays a regex.
 */
import { resolveToken } from "../support/api";
import { openReviewsTable } from "../support/ad-hoc-question";
import { ALL_USERS_GROUP, updatePermissionsGraph } from "../support/dashboard-repros";
import { createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { tableInteractive } from "../support/models";
import { tableHeaderColumn } from "../support/notebook";
import { signInWithCachedSession } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { icon, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ORDERS_TOTAL_FIELD = [
  "field",
  ORDERS.TOTAL,
  {
    "base-type": "type/Float",
  },
];

const CREATED_AT_MONTH_BREAKOUT = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

const QUERY = {
  "source-table": ORDERS_ID,
  aggregation: [["count"], ["sum", ORDERS_TOTAL_FIELD]],
  breakout: [CREATED_AT_MONTH_BREAKOUT],
};

test.describe("issue 11994", () => {
  let pivotQuestionId: number;
  let comboQuestionId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const pivot = await createQuestion(mb.api, {
      database: SAMPLE_DB_ID,
      query: QUERY,
      display: "pivot",
      // If these visualization_settings are missing, they will be automatically
      // added in FE, which will turn the question dirty, which will cause
      // permission issues due to an extra call to /api/dataset/pivot endpoint.
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [CREATED_AT_MONTH_BREAKOUT],
          columns: [],
          values: [
            ["aggregation", 0],
            ["aggregation", 1],
          ],
        },
        "pivot_table.column_widths": {
          leftHeaderWidths: [141],
          totalLeftHeaderWidths: 141,
          valueHeaderWidths: {},
        },
      },
    });
    pivotQuestionId = pivot.id;

    const combo = await createQuestion(mb.api, {
      database: SAMPLE_DB_ID,
      query: QUERY,
      display: "combo",
    });
    comboQuestionId = combo.id;

    await mb.signIn("readonly");
  });

  test("does not show raw data toggle for pivot questions (metabase#11994)", async ({
    page,
  }) => {
    await visitQuestion(page, pivotQuestionId);
    await expect(icon(page, "table2")).toHaveCount(0);
    await expect(
      page.getByTestId("qb-header").getByText(/Save/),
    ).toHaveCount(0);
  });

  test("does not offer to save combo question viewed in raw mode (metabase#11994)", async ({
    page,
  }) => {
    await visitQuestion(page, comboQuestionId);
    const questionHref = page.url();
    // The readonly/view-only user's "Switch to data" (table2) toggle sits in a
    // disabled button, so Playwright refuses a normal click (it treats the svg
    // as not-enabled). Cypress clicks the svg regardless — force it (PORTING
    // wave-10 gotcha). The point of the test is only that no Save is offered.
    await icon(page, "table2").click({ force: true });
    await expect.poll(() => page.url()).toBe(questionHref);
    await expect(
      page.getByTestId("qb-header").getByText(/Save/),
    ).toHaveCount(0);
  });
});

test.describe("issue 39221", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  for (const user of ["admin", "normal"] as const) {
    test(`${user.toUpperCase()}: updating user-specific setting should not result in fetching all site settings (metabase#39221)`, async ({
      page,
      mb,
    }) => {
      // cy.intercept("GET", "/api/setting").as("siteSettings") +
      // cy.get("@siteSettings").should("be.null"): the admin all-settings
      // endpoint must never fire during this flow.
      let siteSettingsFetched = false;
      page.on("response", (response) => {
        if (
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/setting"
        ) {
          siteSettingsFetched = true;
        }
      });

      await mb.signOut();
      await mb.signIn(user);
      await openReviewsTable(page, { mode: "notebook" });

      // Opening a SQL preview sidebar triggers a user-local setting update. The
      // Cypress original then cy.wait("@sessionProperties"), which is satisfied
      // retroactively by the page-load session/properties (cy.wait consumes past
      // responses); the click itself fires no session/properties. Anchor instead
      // on what the click actually triggers — the SQL preview's native query
      // (POST /api/dataset/native) — to settle network before asserting that
      // GET /api/setting (the all-settings fetch) never fired (PORTING rule 2 /
      // "register at the true trigger").
      const sqlPreview = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset/native",
      );
      await page.getByLabel("View SQL", { exact: true }).click();
      await sqlPreview;

      expect(siteSettingsFetched).toBe(false);
    });
  }
});

test.describe("issue 76710", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": {
            PUBLIC: {
              [ORDERS_ID]: "unrestricted",
              [PRODUCTS_ID]: "blocked",
            },
          },
          "create-queries": {
            PUBLIC: {
              [ORDERS_ID]: "query-builder",
            },
          },
        },
      },
    });
  });

  test("can view a table whose foreign key targets a table the user can't access (metabase#76710)", async ({
    page,
    context,
  }) => {
    const fkTargetField = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/field/${PRODUCTS.ID}`,
    );
    await signInWithCachedSession(context, "none");
    await page.goto(`/table/${ORDERS_ID}`);

    const response = await fkTargetField;
    expect(response.status()).toBe(403);

    await expect(tableInteractive(page)).toBeVisible();
    await expect(tableHeaderColumn(page, "Product ID")).toBeVisible();
  });
});
