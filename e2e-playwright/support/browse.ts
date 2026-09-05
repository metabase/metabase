/**
 * Helpers for the Browse page spec, ported from the spec-local functions in
 * e2e/test/scenarios/onboarding/home/browse.cy.spec.ts.
 *
 * New helpers live here (not in the shared support/*.ts files, which parallel
 * porting agents edit); everything else is imported read-only. Fold into a
 * shared browse module at consolidation.
 */
import type { Locator, Page } from "@playwright/test";

/**
 * Port of the spec-local verifiedFilterToggleButton:
 * cy.findByTestId("browse-models-header").findByRole("switch", { name:
 * /show.*verified.*models/i }). The name regex is a case-insensitive substring.
 */
export function verifiedFilterToggleButton(page: Page): Locator {
  return page
    .getByTestId("browse-models-header")
    .getByRole("switch", { name: /show.*verified.*models/i });
}

/** Port of the EE describe's recentsGrid: findByRole("grid", { name: "Recents" }). */
export function recentsGrid(page: Page): Locator {
  return page.getByRole("grid", { name: "Recents", exact: true });
}

/** Port of the EE describe's modelsTable: findByRole("table", { name: "Table of models" }). */
export function modelsTable(page: Page): Locator {
  return page.getByRole("table", { name: "Table of models", exact: true });
}

/** modelsTable().findByRole("heading", { name }). */
export function modelHeading(page: Page, name: string): Locator {
  return modelsTable(page).getByRole("heading", { name, exact: true });
}

/** modelsTable().findByRole("row", { name: /Model N/i }). */
export function modelRow(page: Page, name: string | RegExp): Locator {
  return modelsTable(page).getByRole("row", { name });
}

/** recentsGrid().findByText(name). */
export function recentModel(page: Page, name: string): Locator {
  return recentsGrid(page).getByText(name, { exact: true });
}

/**
 * Port of the spec-local setVerification: open the model's "Move, trash, and
 * more…" menu and click the given menu item (Verify / Remove verification).
 */
async function setVerification(page: Page, linkSelector: RegExp) {
  await page.getByLabel("Move, trash, and more…").click();
  await page.getByRole("menu").getByText(linkSelector).click();
}

/**
 * Port of the spec-local verifyModel: verify the currently-open model and wait
 * for the POST /api/moderation-review (the @updateVerification alias). Register
 * the wait before the triggering click (PORTING rule 2).
 */
export async function verifyModel(page: Page) {
  const updateVerification = waitForUpdateVerification(page);
  await setVerification(page, /Verify this model/);
  await updateVerification;
}

/** Port of the spec-local unverifyModel. */
export async function unverifyModel(page: Page) {
  const updateVerification = waitForUpdateVerification(page);
  await setVerification(page, /Remove verification/);
  await updateVerification;
}

/**
 * Port of the spec-local toggleVerificationFilter: flip the header switch and
 * wait for the PUT /api/setting/browse-filter-only-verified-models
 * (the @updateFilter alias).
 */
export async function toggleVerificationFilter(page: Page) {
  const updateFilter = waitForUpdateFilter(page);
  await verifiedFilterToggleButton(page).click();
  await updateFilter;
}

/** Port of the @updateVerification intercept: POST /api/moderation-review. */
export function waitForUpdateVerification(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/moderation-review",
  );
}

/** Port of the @updateFilter intercept: PUT /api/setting/browse-filter-only-verified-models. */
export function waitForUpdateFilter(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname ===
        "/api/setting/browse-filter-only-verified-models",
  );
}

