/**
 * Helpers for the filter specs — ports of the filter-related `H` helpers
 * from e2e-notebook-helpers.ts and e2e-ui-elements-helpers.js. Lives in its
 * own file so the shared support modules stay untouched.
 */
import type { Locator, Page } from "@playwright/test";

import { escapeRegExp } from "./text";

// Port of H.clauseStepPopover(): popover({ testId: "clause-popover" }) —
// the Cypress helper appends the testid to the popover element selector.
const CLAUSE_POPOVER_SELECTOR =
  ".popover[data-state~='visible'][data-testid='clause-popover']," +
  "[data-element-id=mantine-popover][data-testid='clause-popover']";

export function clauseStepPopover(page: Page): Locator {
  return page.locator(CLAUSE_POPOVER_SELECTOR).filter({ visible: true });
}

/**
 * Port of cy.contains(text) inside a scope: case-sensitive substring match
 * (Playwright's string matching is case-insensitive, so use an escaped
 * case-sensitive regex — PORTING.md rule 1).
 */
export function containsText(scope: Locator, text: string): Locator {
  return scope.getByText(new RegExp(escapeRegExp(text)));
}
