/**
 * Playwright port of e2e/test/scenarios/i18n/i18n.cy.spec.ts
 *
 * Sets the (normal) user's locale via the profile page, then walks the pages
 * reachable within one click of the homepage and asserts each renders its
 * <main> with no error boundary. The Cypress `cy.intercept`/`cy.wait` for the
 * locale-save PUT lives in support/i18n.ts selectLocale (PORTING rule 2).
 * `findByRole("main")` → getByRole("main"); `findAllByTestId(...).should("not.exist")`
 * → toHaveCount(0).
 */
import { test, expect } from "../support/fixtures";
import { selectLocale, visitPath } from "../support/i18n";

const paths = [
  "/",
  "/getting-started",
  "/collection/root",
  "/browse/models",
  "/browse/databases",
  "/browse/metrics",
  "/trash",
  "/admin",
];

const locales = [
  "Chinese (China)",
  "Chinese (Taiwan)",
  "French",
  "German",
  "Italian",
  "Japanese",
  "Korean",
  "Portuguese (Brazil)",
  "Russian",
  "Spanish",
];

test.describe(
  "Pages accessible within one click from the homepage should work in popular locales",
  () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsNormalUser();
    });

    for (const localeName of locales) {
      test(`Pages should be reachable when locale is ${localeName}`, async ({
        page,
      }) => {
        await selectLocale(page, localeName);
        for (const path of paths) {
          await visitPath(page, path);
          await expect(page.getByRole("main")).toBeVisible();
          await expect(page.getByTestId("error-boundary")).toHaveCount(0);
        }
      });
    }
  },
);
