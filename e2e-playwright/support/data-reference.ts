/**
 * Helpers for data-reference / data-studio specs.
 *
 * Ports of:
 * - H.DataStudio.nav() (e2e/support/helpers/e2e-data-studio-helpers.ts)
 * - H.DataModel.visitDataStudio() with no ids
 *   (e2e/support/helpers/e2e-datamodel-helpers.ts) — visits the base path and
 *   waits for the database-list request the page fires on load.
 */
import type { Locator, Page } from "@playwright/test";

export function dataStudioNav(page: Page): Locator {
  return page.getByTestId("data-studio-nav");
}

export async function visitDataStudio(page: Page): Promise<void> {
  const databases = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/database",
  );
  await page.goto("/data-studio/data");
  await databases;
}
