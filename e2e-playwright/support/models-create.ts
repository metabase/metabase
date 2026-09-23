/**
 * Helpers for the models/create spec port (tests/models-create.spec.ts).
 * Local ports of the spec's module-level `navigateToNewModelPage` and
 * `checkIfPinned`; everything else is imported from shared modules.
 */
import type { Page, Response } from "@playwright/test";

import { expect } from "./fixtures";
import { icon, popover } from "./ui";

/**
 * Port of the spec-local navigateToNewModelPage(queryType): visit /model/new
 * and pick the query editor. Defaults to the native editor (like the Cypress
 * original).
 */
export async function navigateToNewModelPage(
  page: Page,
  queryType: "native" | "structured" = "native",
) {
  await page.goto("/model/new");
  const option =
    queryType === "structured" ? "Use the notebook editor" : "Use a native query";
  await page.getByText(option, { exact: true }).click();
}

/**
 * Register the wait behind the spec's `cy.intercept("POST", "/api/card")`
 * alias. Call BEFORE the save-triggering action, await after (PORTING rule 2).
 */
export function waitForCreateModel(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
}

/**
 * Port of the spec-local checkIfPinned(modelName): navigate to the root
 * collection via the app bar, then confirm the freshly-created model landed
 * pinned (its row menu offers "Unpin").
 */
export async function checkIfPinned(page: Page, modelName: string) {
  await page
    .getByTestId("app-bar")
    .getByText("Our analytics", { exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe("/collection/root");

  // Cypress: findByText(modelName).closest("a").find(".Icon-ellipsis").click.
  // The ellipsis is hover-gated, so hover the card's anchor before clicking.
  const anchor = page
    .getByText(modelName, { exact: true })
    .locator("xpath=ancestor-or-self::a[1]");
  await anchor.hover();
  await icon(anchor, "ellipsis").click({ force: true });

  await expect(
    popover(page).getByText("Unpin", { exact: true }),
  ).toBeVisible();
}
