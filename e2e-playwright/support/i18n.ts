/**
 * Helpers for the i18n spec (e2e/test/scenarios/i18n/i18n.cy.spec.ts).
 */
import type { Page } from "@playwright/test";

import { popover } from "./ui";

/**
 * Port of the spec-local `selectLocale`: open the profile page, pick a locale
 * from the user-locale select, submit, and wait for the PUT that persists it.
 *
 * The Cypress original registered `cy.intercept("PUT", "/api/user/*")` in the
 * beforeEach and `cy.wait`ed it here; per PORTING rule 2 the wait is registered
 * (waitForResponse) before the triggering submit click and awaited after.
 * `findByText(localeName)` is a testing-library string → exact match (rule 1).
 */
export async function selectLocale(page: Page, localeName: string) {
  await page.goto("/account/profile");
  await page.getByTestId("user-locale-select").getByRole("textbox").click();
  await popover(page).getByText(localeName, { exact: true }).click();

  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/user\/\d+$/.test(new URL(response.url()).pathname),
  );
  await page.locator("[type=submit]").click();
  await updated;
}

/**
 * Tolerant navigation, mirroring cy.visit's resilience: the homepage fires a
 * client-side redirect that supersedes the in-flight navigation and aborts
 * goto (net::ERR_ABORTED) even though the target page renders fine. Swallow
 * that specific abort and wait for the resulting document; the caller's
 * retrying assertions validate the final page.
 */
export async function visitPath(page: Page, path: string) {
  try {
    await page.goto(path, { waitUntil: "commit" });
  } catch (error) {
    if (!String(error).includes("ERR_ABORTED")) {
      throw error;
    }
    await page.waitForLoadState("domcontentloaded");
  }
}
