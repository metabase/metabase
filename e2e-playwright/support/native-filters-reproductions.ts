/**
 * Per-spec helpers for the native-filters-reproductions port
 * (e2e/test/scenarios/native-filters/native-filters-reproductions.cy.spec.js).
 *
 * Lives in its own file so the shared support modules stay untouched. The
 * SQLFilter.* / FieldFilter.* surface is already ported across
 * support/native-filters.ts, support/sql-filters.ts and
 * support/sql-filters-source.ts — only what those don't cover is here.
 */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { popover } from "./ui";

/**
 * Port of `cy.location("search").should("eq", value)`. Cypress RETRIES this
 * assertion, so a one-shot read of page.url() would catch the transient
 * pre-update state — hence expect.poll.
 */
export async function expectLocationSearch(page: Page, expected: string) {
  await expect
    .poll(() => new URL(page.url()).search)
    .toBe(expected);
}

/** Port of a Cypress `.next()`: the element's immediately following sibling. */
export function nextSibling(scope: Locator): Locator {
  return scope.locator("xpath=following-sibling::*[1]");
}

/**
 * Port of `cy.findAllByText("Variable name").parent()` — the tag-editor blocks,
 * in template-tag order.
 */
export function variableNameFields(page: Page): Locator {
  return page.getByText("Variable name", { exact: true }).locator("..");
}

/**
 * Port of `cy.findAllByText("Variable name").next()` — the input that follows
 * each "Variable name" label.
 */
export function variableNameLabels(page: Page): Locator {
  return nextSibling(page.getByText("Variable name", { exact: true }));
}

/**
 * Port of FieldFilter.addDefaultStringFilter → enterDefaultValue
 * (e2e-field-filter-helpers.js):
 *
 *   cy.findByText("Enter a default value…").click();
 *   cy.findByPlaceholderText("Enter a default value…").type(value).blur();
 *   cy.button(buttonLabel).click();
 *
 * Two PORTING gotchas are compensated here:
 * - The default-value widget is a MultiAutocomplete whose `placeholder` is
 *   dropped once a value is entered, so re-resolving the placeholder locator
 *   for the `.blur()` would find NOTHING. Blur the *focused* input instead.
 * - Clicking a submit button while a MultiAutocomplete still holds focus is
 *   silently swallowed (blur re-renders the form, so mouseup lands on a
 *   replaced node) — the explicit blur above also fixes that.
 */
export async function addDefaultStringFilter(
  page: Page,
  value: string,
  buttonLabel = "Add filter",
) {
  await page.getByText("Enter a default value…", { exact: true }).click();

  const input = popover(page).getByPlaceholder("Enter a default value…");
  await expect(input).toBeVisible();
  await input.click();
  await page.keyboard.type(value);
  await page.locator("input:focus").blur();

  await page
    .getByRole("button", { name: buttonLabel, exact: true })
    .click();
}

/**
 * `cy.visit(url)` for a saved question, waiting on the same
 * `POST /api/card/**​/:id/query` the Cypress `@cardQuery` alias named. The
 * shared ui.ts visitQuestion always navigates to `/question/:id`, so it can't
 * carry the query string these repros load the parameter value through.
 */
export async function visitQuestionUrlAwaitingCardQuery(
  page: Page,
  id: number,
  url: string,
) {
  const cardQuery = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new RegExp(`^/api/card/.*\\b${id}/query$`).test(
        new URL(response.url()).pathname,
      ),
  );
  await page.goto(url);
  await cardQuery;
}
