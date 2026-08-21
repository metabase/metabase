/**
 * Helpers for the app-bar "+ New" menu
 * (e2e/test/scenarios/onboarding/navbar/new-menu.cy.spec.js).
 *
 * The Cypress beforeEach navigates home and clicks the app-bar "New" button.
 * `newButton` lives in ui.ts (imported read-only); this module just wraps the
 * open flow so the spec reads like the original.
 */
import type { Page } from "@playwright/test";

import { newButton } from "./ui";

/** Port of the spec beforeEach's `cy.visit("/")` + `cy.findByText("New").click()`:
 * go home and open the app-bar "New" menu. */
export async function openNewMenu(page: Page) {
  await page.goto("/");
  await newButton(page).click();
}
