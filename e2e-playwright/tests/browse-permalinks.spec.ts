/**
 * Playwright port of e2e/test/scenarios/onboarding/home/browse-permalinks.cy.spec.ts
 *
 * Name-based /browse URLs for databases, schemas and tables, added by
 * "Permalinks for dbs, schemas and tables" (#77274, 1a6755d898a). Its sibling
 * change also rewrote the slugify test in onboarding/urls.cy.spec.js — see
 * tests/onboarding-urls.spec.ts, which covers the legacy id-slug fallback.
 *
 * Port notes:
 * - findByText / findByRole(name: string) are exact matches (rule 1).
 * - `cy.location("pathname").should("eq", …)` → `expectPathname` (support/
 *   onboarding.ts), which polls: Cypress retried the location read, so a
 *   one-shot check would catch transient mid-redirect states (PORTING wave 5).
 *   `new URL().pathname` keeps the percent-encoding, matching Cypress's
 *   `location("pathname")`, so the "%20" literals port across unchanged.
 * - The `@mongo` describe restores `mongo-5` and needs the QA Mongo container,
 *   so it is gated on PW_QA_DB_ENABLED like every other mongo describe here.
 */
import { expect, test } from "../support/fixtures";
import { expectPathname } from "../support/onboarding";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe("browse > name-based urls > databases", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("uses the name url when clicking through, and resolves that url directly", async ({
    page,
  }) => {
    await page.goto("/browse/databases");
    await page
      .getByTestId("database-browser")
      .getByText("Sample Database", { exact: true })
      .click();

    await expectPathname(page, "/browse/databases/Sample%20Database");
    await expect(
      page.getByRole("heading", { name: "Orders", exact: true }),
    ).toBeVisible();

    await page.goto("/browse/databases/Sample%20Database");

    await expect(
      page.getByRole("heading", { name: "Orders", exact: true }),
    ).toBeVisible();
    await expectPathname(page, "/browse/databases/Sample%20Database");
  });

  test("resolves the id-slug url", async ({ page }) => {
    await page.goto(`/browse/databases/${SAMPLE_DB_ID}-sample-database`);

    await expect(
      page.getByRole("heading", { name: "Orders", exact: true }),
    ).toBeVisible();
  });

  test("shows not-found for a user without access to the database", async ({
    mb,
    page,
  }) => {
    await mb.signIn("nodata");
    await page.goto("/browse/databases/Sample%20Database");

    await expect(page.getByLabel("error page", { exact: true })).toBeVisible();
  });
});

test.describe("browse > name-based urls > schemas", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("opens a schema from database + schema names, keeping the name url", async ({
    page,
  }) => {
    await page.goto("/browse/databases/Sample%20Database/schema/PUBLIC");

    await expect(
      page.getByRole("heading", { name: "Orders", exact: true }),
    ).toBeVisible();
    await expectPathname(
      page,
      "/browse/databases/Sample%20Database/schema/PUBLIC",
    );
  });

  test("shows not-found for a user without access to the schema's database", async ({
    mb,
    page,
  }) => {
    await mb.signIn("nodata");
    await page.goto("/browse/databases/Sample%20Database/schema/PUBLIC");

    await expect(page.getByLabel("error page", { exact: true })).toBeVisible();
  });
});

test.describe("browse > name-based urls > tables", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("redirects a table name url to the query builder", async ({ page }) => {
    await page.goto(
      "/browse/databases/Sample%20Database/schema/PUBLIC/table/ORDERS",
    );

    await expect(page.getByRole("button", { name: /Summarize/ })).toBeVisible();
    await expectPathname(page, `/table/${ORDERS_ID}-orders`);
  });

  test("shows not-found for a user without access to the table", async ({
    mb,
    page,
  }) => {
    await mb.signIn("nodata");
    await page.goto(
      "/browse/databases/Sample%20Database/schema/PUBLIC/table/ORDERS",
    );

    await expect(page.getByLabel("error page", { exact: true })).toBeVisible();
  });
});

test.describe(
  "browse > name-based urls > schema-less database",
  { tag: ["@external", "@mongo"] },
  () => {
    // The mongo-5 snapshot only exists when the QA-DB containers were up during
    // snapshot generation (Cypress gates this via the @mongo tag).
    test.skip(
      !process.env.PW_QA_DB_ENABLED,
      "Requires the mongo QA database and its mongo-5 snapshot (set PW_QA_DB_ENABLED)",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore("mongo-5");
      await mb.signInAsNormalUser();
    });

    test("redirects a table name url with no schema segment to the query builder", async ({
      page,
    }) => {
      await page.goto("/browse/databases/QA%20Mongo/table/orders");

      await expect(
        page.getByRole("button", { name: /Summarize/ }),
      ).toBeVisible();
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toMatch(/^\/table\/\d+/);
    });
  },
);
