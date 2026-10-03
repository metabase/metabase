/**
 * Helpers for the question-management spec port (question-management.cy.spec.js).
 * Ports of the spec-local functions and the one `H` helper not yet in a shared
 * module (getPersonalCollectionName). Everything else is imported read-only from
 * the shared support modules.
 *
 * Kept in its own file per the porting rules (parallel agents never edit shared
 * files); fold into a domain module at consolidation.
 */
import type { Page, Response } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import { entityPickerModal } from "./notebook";
import { ORDERS_QUESTION_ID } from "./sample-data";
import { expect } from "./fixtures";
import { openQuestionActions } from "./models";
import { navigationSidebar, popover } from "./ui";

function findQuestionId(name: string): number {
  const question = SAMPLE_INSTANCE_DATA.questions.find(
    (question) => question.name === name,
  );
  if (!question) {
    throw new Error(
      `Question "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(question.id);
}

export const ORDERS_COUNT_QUESTION_ID = findQuestionId("Orders, Count");

/**
 * Port of H.getPersonalCollectionName(USERS[user]): `${first} ${last}'s Personal
 * Collection`. The Playwright USERS map (sample-data.ts) only carries
 * email/password, so the first/last names are mirrored here from
 * e2e/support/cypress_data.js for the users this spec signs in as.
 */
const USER_FULL_NAMES: Record<string, string> = {
  admin: "Bobby Tables",
  normal: "Robert Tableton",
  nodata: "No Data Tableton",
  readonly: "Read Only Tableton",
};

export function getPersonalCollectionName(user: string): string {
  const fullName = USER_FULL_NAMES[user];
  if (!fullName) {
    throw new Error(`No full name mapped for user "${user}"`);
  }
  return `${fullName}'s Personal Collection`;
}

/**
 * Register the wait behind the spec's `cy.intercept("PUT", "/api/card/:id")`
 * alias. Call BEFORE the action that triggers the save, await after.
 */
export function waitForCardUpdate(page: Page, id: number): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/card/${id}`,
  );
}

/** Port of assertRequestNot403: the PUT must not have been rejected as 403. */
export async function assertNot403(responsePromise: Promise<Response>) {
  const response = await responsePromise;
  expect(response.status()).not.toBe(403);
}

/** Port of assertNoPermissionsError (note the curly apostrophe in the copy). */
export async function assertNoPermissionsError(page: Page) {
  await expect(
    page.getByText("Sorry, you don’t have permission to see that.", {
      exact: true,
    }),
  ).toHaveCount(0);
}

/**
 * Port of the spec-local turnIntoModel: open the actions menu, click "Turn into
 * a model", confirm the dialog, and assert the save went through cleanly. The
 * PUT wait is registered around the confirm click.
 */
export async function turnIntoModel(page: Page, id = ORDERS_QUESTION_ID) {
  await openQuestionActions(page);
  await page.getByRole("menu").getByText("Turn into a model", { exact: true }).click();
  const update = waitForCardUpdate(page, id);
  await page
    .getByRole("dialog")
    .getByText("Turn this into a model", { exact: true })
    .click();
  await assertNot403(update);
  await expect(
    page.getByRole("status").filter({ hasText: "This is a model now." }),
  ).toBeVisible();
  await assertNoPermissionsError(page);
}

/**
 * Port of findPickerItem: the entity-picker row for `name`, walked up to its
 * anchor (which carries the data-active / data-disabled attributes). Cypress
 * `findByText(name)` with a string is an exact match.
 */
export function findPickerItem(page: Page, name: string) {
  return entityPickerModal(page)
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::a[1]");
}

/** Port of findActivePickerItem: the row must carry data-active="true". */
export async function assertActivePickerItem(page: Page, name: string) {
  await expect(findPickerItem(page, name)).toHaveAttribute(
    "data-active",
    "true",
  );
}

/** Port of findInactivePickerItem: the row must NOT carry data-active="true". */
export async function assertInactivePickerItem(page: Page, name: string) {
  await expect(findPickerItem(page, name)).not.toHaveAttribute(
    "data-active",
    "true",
  );
}

/**
 * Port of moveQuestionTo: open the actions menu, click Move, pick the
 * destination in the entity picker, and confirm. `newCollectionName` may be a
 * string (exact, as Cypress findByText) or a RegExp. Does NOT await the save —
 * the caller registers the PUT wait around it when it needs to.
 */
export async function moveQuestionTo(
  page: Page,
  newCollectionName: string | RegExp,
) {
  await openQuestionActions(page);
  await page.getByTestId("move-button").click();
  const modal = entityPickerModal(page);
  await modal
    .getByText(newCollectionName, { exact: typeof newCollectionName === "string" })
    .click();
  await modal.getByRole("button", { name: "Move" }).click();
}

/**
 * Port of the repeated navigationSidebar aria-selected checks:
 * `findByText(text).parents("li").should("have.attr","aria-selected", value)`.
 */
export async function assertSidebarItemSelected(
  page: Page,
  text: string,
  value: "true" | "false",
) {
  await expect(
    navigationSidebar(page)
      .getByText(text, { exact: true })
      .locator("xpath=ancestor::li[1]"),
  ).toHaveAttribute("aria-selected", value);
}

/** The click-behavior "Add to dashboard" action item inside the actions popover. */
export function addToDashboardPopoverItem(page: Page) {
  return popover(page).getByText("Add to dashboard", { exact: true });
}
