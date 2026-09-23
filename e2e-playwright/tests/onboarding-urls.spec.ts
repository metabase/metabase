/**
 * Playwright port of e2e/test/scenarios/onboarding/urls.cy.spec.js
 *
 * - SAVED_QUESTIONS_VIRTUAL_DB_ID is inlined: the Cypress spec imports it
 *   from frontend metabase-lib source, which is outside this project's
 *   tsconfig include.
 * - The two "Saved Questions" iterations share a title upstream; the URL is
 *   appended here because Playwright requires unique test titles.
 */
import { test, expect } from "../support/fixtures";
import {
  NORMAL_PERSONAL_COLLECTION_ID,
  USER_NAMES,
  expectPathname,
  getFullName,
  getUsersPersonalCollectionSlug,
} from "../support/onboarding";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import {
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DB_ID,
} from "../support/sample-data";

// Inlined from frontend/src/metabase-lib/v1/metadata/utils/saved-questions.js
const SAVED_QUESTIONS_VIRTUAL_DB_ID = -1337;

const { admin, normal } = USER_NAMES;

test.describe("URLs", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("browse databases", () => {
    // UPSTREAM DRIFT (re-ported): this was
    // 'should slugify database name when opening it from /browse/databases"',
    // which clicked through from /browse/databases and asserted the id-slug
    // URL. "Permalinks for dbs, schemas and tables" (#77274, 1a6755d898a)
    // switched the browser to NAME-based URLs — clicking now lands on
    // /browse/databases/Sample%20Database — and replaced the test with the
    // legacy-URL compatibility check below. Verified against a current build:
    // the name-based URL is the new intended behaviour, not a regression.
    test("should still open a database from a legacy id-slug url", async ({
      page,
    }) => {
      const url = `/browse/databases/${SAMPLE_DB_ID}-sample-database`;
      await page.goto(url);
      await expect(page.getByTestId("browse-schemas")).toBeAttached();
      await expectPathname(page, url);
    });

    for (const url of [
      `/browse/databases/${SAVED_QUESTIONS_VIRTUAL_DB_ID}`,
      `/browse/databases/${SAVED_QUESTIONS_VIRTUAL_DB_ID}-saved-questions`,
    ]) {
      test(`should open 'Saved Questions' database correctly (${url})`, async ({
        page,
      }) => {
        await page.goto(url);
        await expect(
          page.getByRole("heading", { name: "Databases", exact: true }),
        ).toBeVisible();
        await expectPathname(page, url);
      });
    }
  });

  test.describe("dashboards", () => {
    test("should slugify dashboard URLs", async ({ page }) => {
      await page.goto("/collection/root");
      await page.getByText("Orders in a dashboard", { exact: true }).click();
      await expectPathname(
        page,
        `/dashboard/${ORDERS_DASHBOARD_ID}-orders-in-a-dashboard`,
      );
    });
  });

  test.describe("questions", () => {
    test("should slugify question URLs", async ({ page }) => {
      await page.goto("/collection/root");
      await page.getByText("Orders", { exact: true }).click();
      await expectPathname(page, `/question/${ORDERS_QUESTION_ID}-orders`);
    });
  });

  test.describe("collections", () => {
    test("should slugify collection name", async ({ page }) => {
      await page.goto("/collection/root");
      await page
        .getByTestId("collection-entry-name")
        .filter({ hasText: "First collection" })
        .click();
      await expectPathname(
        page,
        `/collection/${FIRST_COLLECTION_ID}-first-collection`,
      );
    });

    test("should slugify current user's personal collection name correctly", async ({
      page,
    }) => {
      await page.goto("/collection/root");
      await page
        .getByText("Your personal collection", { exact: true })
        .click();
      await expectPathname(
        page,
        `/collection/${ADMIN_PERSONAL_COLLECTION_ID}-${getUsersPersonalCollectionSlug(
          admin,
        )}`,
      );
    });

    test("should not slugify users' collections page URL", async ({ page }) => {
      await page.goto("/collection/users");
      await expect(page.getByTestId("browsercrumbs")).toContainText(
        /All personal collections/i,
      );
      await expectPathname(page, "/collection/users");
    });

    test("should open slugified URLs correctly", async ({ page }) => {
      await page.goto(`/collection/${FIRST_COLLECTION_ID}-first-collection`);
      await expect(page.getByTestId("collection-name-heading")).toHaveText(
        "First collection",
      );

      await page.goto(
        `/collection/${ADMIN_PERSONAL_COLLECTION_ID}-${getUsersPersonalCollectionSlug(
          admin,
        )}`,
      );
      await expect(page.getByTestId("collection-name-heading")).toHaveText(
        `${getFullName(admin)}'s Personal Collection`,
      );

      await page.goto(
        `/collection/${NORMAL_PERSONAL_COLLECTION_ID}-${getUsersPersonalCollectionSlug(
          normal,
        )}`,
      );
      await expect(page.getByTestId("collection-name-heading")).toHaveText(
        `${getFullName(normal)}'s Personal Collection`,
      );
    });
  });
});
