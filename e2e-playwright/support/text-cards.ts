/**
 * Helpers for the text-cards spec port (text-cards.cy.spec.js).
 *
 * The consolidated modules already carry `addTextBox` (dashboard-management.ts,
 * which enters edit mode first) and `addHeadingWhileEditing`
 * (dashboard-parameters.ts). The one shape they don't cover is
 * H.addTextBoxWhileEditing — adding a text card when the dashboard is ALREADY
 * in edit mode — so it lives here.
 */
import type { Page } from "@playwright/test";

import { popover } from "./ui";

/**
 * Port of H.addTextBoxWhileEditing: assumes the dashboard is already in edit
 * mode (unlike H.addTextBox, which clicks "Edit dashboard" first). The Cypress
 * original's `parseSpecialCharSequences: false` option only matters for its
 * `cy.type()` — Playwright's `fill()` types the literal text (including
 * `{{foo}}`) with no escape parsing, so no equivalent option is needed.
 */
export async function addTextBoxWhileEditing(page: Page, text: string) {
  await page.getByLabel("Add a heading or text box", { exact: true }).click();
  await popover(page).getByText("Text", { exact: true }).click();
  await page
    .getByPlaceholder(
      "You can use Markdown here, and include variables {{like_this}}",
      { exact: true },
    )
    .fill(text);
}
