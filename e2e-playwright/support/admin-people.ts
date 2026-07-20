/**
 * Spec-local helpers for the admin-people port
 * (e2e/test/scenarios/admin-2/people.cy.spec.js).
 *
 * Everything here is a port of a helper defined at the bottom of that Cypress
 * file, plus the two data constants it pulls out of
 * e2e/support/cypress_data.js. Lives in its own module so the shared support
 * files stay untouched (PORTING.md rule 9).
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { icon } from "./ui";

// === ports of e2e/support/cypress_data.js ===

/**
 * Port of USERS (e2e/support/cypress_data.js). The Playwright
 * `support/sample-data.ts` USERS map carries only the five users with cached
 * sessions; this spec needs the full ten (it counts them, searches them by
 * name, and reads first/last names off `normal` and `nocollection`).
 */
export const ALL_USERS = {
  admin: { first_name: "Bobby", last_name: "Tables" },
  normal: { first_name: "Robert", last_name: "Tableton" },
  nodata: { first_name: "No Data", last_name: "Tableton" },
  sandboxed: { first_name: "User", last_name: "1" },
  readonly: { first_name: "Read Only", last_name: "Tableton" },
  readonlynosql: { first_name: "Read Only Data No Sql", last_name: "Tableton" },
  nocollection: { first_name: "No Collection", last_name: "Tableton" },
  nosql: { first_name: "No SQL", last_name: "Tableton" },
  none: { first_name: "None", last_name: "Tableton" },
  impersonated: { first_name: "User", last_name: "Impersonated" },
} as const;

/** `Object.entries(USERS).length` in the Cypress spec. */
export const TOTAL_USERS = Object.keys(ALL_USERS).length;

/** Port of USER_GROUPS — `Object.entries(USER_GROUPS).length` is TOTAL_GROUPS. */
export const USER_GROUPS = {
  ALL_USERS_GROUP: 1,
  ADMIN_GROUP: 2,
  COLLECTION_GROUP: 5,
  DATA_GROUP: 6,
  READONLY_GROUP: 7,
  NOSQL_GROUP: 8,
} as const;

export const TOTAL_GROUPS = Object.keys(USER_GROUPS).length;

/** Port of H.getFullName. */
export function getFullName(user: { first_name: string; last_name: string }) {
  return `${user.first_name} ${user.last_name}`;
}

// === ports of the spec-local helpers ===

/**
 * The `<tr>` containing the given full name. The `has:` text locator is built
 * from `page`, never from a scope Locator (PORTING: a `has` sub-locator built
 * from a Locator gets re-anchored to the outer scope and never resolves).
 */
export function userRow(page: Page, fullName: string): Locator {
  return page
    .locator("tr")
    .filter({ has: page.getByText(fullName, { exact: true }) });
}

/** Port of showUserOptions: open the row's ellipsis menu. */
export async function showUserOptions(page: Page, fullName: string) {
  await icon(userRow(page, fullName), "ellipsis").click();
}

/**
 * Port of clickButton: `cy.button(name).should("not.be.disabled").click()`.
 * `cy.button` is `findByRole("button", { name })` — an EXACT match (rule 1).
 */
export async function clickButton(scope: Page | Locator, name: string) {
  const button = scope.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
}

/**
 * Port of assertTableRowsCount.
 *
 * The Cypress original is
 * `cy.findByTestId("admin-layout-content").get("table tbody tr")` — and
 * `cy.get()` RESETS the subject, so the testid half never scopes anything and
 * the selector that actually executes is the page-wide `table tbody tr`
 * (PORTING: "cy.get() RESETS the subject — port what actually executes"). The
 * `findByTestId` still carries an implicit existence assertion (testing-library
 * throws when it misses), so that is ported as its own visibility assertion
 * rather than dropped.
 */
export async function assertTableRowsCount(page: Page, length: number) {
  await expect(page.getByTestId("admin-layout-content")).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(length);
}

/** Port of generateUsers: `count` users created straight through the API. */
export async function generateUsers(api: MetabaseApi, count: number) {
  for (let index = 0; index < count; index++) {
    // Port of cy.createUserFromRawData: POST /api/user, then dismiss the
    // "it's ok to play around" modal for the created user.
    const response = await api.post("/api/user", {
      first_name: `FirstName ${index}`,
      last_name: `LastName ${index}`,
      email: `user_${index}@metabase.com`,
      password: `secure password ${index}`,
    });
    const { id } = (await response.json()) as { id: number };
    await api.put(`/api/user/${id}/modal/qbnewb`, {});
  }
}

/** Port of generateGroups. */
export async function generateGroups(api: MetabaseApi, count: number) {
  for (let index = 0; index < count; index++) {
    await api.post("/api/permissions/group", { name: `Group${index}` });
  }
}

/** Port of removeUserFromGroup: click the row's close icon. */
export async function removeUserFromGroup(page: Page, fullName: string) {
  await icon(userRow(page, fullName), "close").click();
}

/** Port of setupGoogleAuth. */
export async function setupGoogleAuth(api: MetabaseApi) {
  await api.put("/api/setting", {
    "google-auth-client-id": "fake-id.apps.googleusercontent.com",
    "google-auth-auto-create-accounts-domain": "metabase.com",
    "google-auth-enabled": true,
  });
}

/** Port of assertLinkMatchesUrl. */
export async function assertLinkMatchesUrl(
  scope: Page | Locator,
  text: string,
  url: string,
) {
  await expect(scope.getByRole("link", { name: text, exact: true })).toHaveAttribute(
    "href",
    url,
  );
}

/**
 * Port of the group-managers describe's confirmLosingAbilityToManageGroup.
 */
export async function confirmLosingAbilityToManageGroup(dialog: Locator) {
  await expect(
    dialog.getByText(
      "You will not be able to manage users of this group anymore.",
      { exact: true },
    ),
  ).toBeVisible();
  await clickButton(dialog, "Confirm");
}

/**
 * The membership-type toggle inside a `GroupMembersTable` row is wrapped in a
 * `visibility: hidden` span that only unhides on `.cell:hover`
 * (UserTypeCell.module.css) — which is why the Cypress original `realHover()`s
 * the "Member"/"Manager" text first. Playwright's actionability check would
 * otherwise wait forever on a hidden element, and the real mouse must stay
 * inside the cell (PORTING: re-hover before acting on hover-gated controls).
 */
export async function toggleUserTypeInRow(row: Locator, currentLabel: string) {
  const cell = row.locator("td").filter({ hasText: currentLabel }).first();
  await cell.hover();
  const toggle = cell.getByTestId("user-type-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
}
