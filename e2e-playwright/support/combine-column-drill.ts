/**
 * Helpers for the combine-column-drill spec port
 * (e2e/test/scenarios/visualizations-tabular/drillthroughs/combine-column.cy.spec.ts):
 * the Combine-columns drill driven from a table COLUMN HEADER (not the "+"
 * Add-column modal that column-shortcuts.ts covers).
 *
 * Kept in its own module per PORTING.md rule 9 (never edit shared support
 * files — import from them read-only).
 */
import type { Page } from "@playwright/test";

import type { StructuredQuestionDetails } from "./factories";
import { SAMPLE_DATABASE } from "./sample-data";
import { tableHeaderClick } from "./notebook";
import { popover } from "./ui";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

/**
 * The shared question both tests visit: PEOPLE limited to ID + Email, so the
 * combine drill has exactly those two columns to work with.
 */
export const peopleIdEmailQuestionDetails: StructuredQuestionDetails = {
  query: {
    "source-table": PEOPLE_ID,
    fields: [
      ["field", PEOPLE.ID, { "base-type": "type/Number" }],
      ["field", PEOPLE.EMAIL, { "base-type": "type/Text" }],
    ],
    limit: 3,
  },
};

/**
 * Open the Combine-columns editor from a table column header: click the header
 * (H.tableHeaderClick) then the "Combine columns" click-action.
 */
export async function openCombineColumnsFromHeader(page: Page, column: string) {
  await tableHeaderClick(page, column);
  await popover(page).getByText("Combine columns", { exact: true }).click();
}
