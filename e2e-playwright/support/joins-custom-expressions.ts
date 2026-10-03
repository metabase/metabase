/**
 * Helpers for the joins-custom-expressions spec port. Lives in its own file so
 * the shared support modules stay untouched; imports read-only from them.
 *
 * Everything here is a thin composition over the shared notebook/join helpers.
 */
import type { Page } from "@playwright/test";

import { enterCustomColumnDetails } from "./notebook";
import { popover } from "./ui";

/**
 * Add one side of a join condition through the Custom Expression editor: the
 * Cypress idiom
 *
 *   H.popover().within(() => {
 *     cy.findByText("Custom Expression").click();
 *     H.enterCustomColumnDetails({ formula });
 *     cy.button("Done").click();
 *   });
 *
 * The join-condition column picker offers a "Custom Expression" entry; picking
 * it swaps the popover to the shared CodeMirror expression editor.
 */
export async function addJoinConditionCustomExpression(
  page: Page,
  formula: string,
) {
  await popover(page).getByText("Custom Expression", { exact: true }).click();
  await enterCustomColumnDetails(page, { formula });
  await popover(page).getByRole("button", { name: "Done", exact: true }).click();
}
