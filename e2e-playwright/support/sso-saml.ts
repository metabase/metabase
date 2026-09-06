/**
 * Helpers for the SSO > SAML admin-settings spec
 * (port of e2e/test/scenarios/admin-2/sso/saml.cy.spec.js and the shared
 * modules it pulls in: shared/helpers.js and shared/group-mappings-widget.js).
 *
 * The group-mappings helpers below are a port of
 * e2e/test/scenarios/admin-2/sso/shared/group-mappings-widget.js, which
 * upstream shares between the SAML, LDAP and JWT specs. They are parameterised
 * by `authenticationMethod` exactly like the original, so when the LDAP/JWT
 * specs land these should move to a shared module rather than being copied.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { expect } from "./fixtures";
import { icon } from "./ui";

/**
 * Port of the spec-local getSamlCard:
 *   findByTestId("admin-layout-content").findByText("SAML").parent().parent()
 * The "SAML" CardTitle's grandparent is the CardRoot, which carries
 * data-testid="saml-setting" (AuthCard.tsx) — the same single element.
 */
export function getSamlCard(page: Page): Locator {
  return page.getByTestId("saml-setting");
}

/**
 * Port of H.typeAndBlurUsingLabel (e2e-misc-helpers.js):
 * findByLabelText(label).clear().type(value).blur(). Unlike the sso-google
 * copy this accepts a RegExp, because the SAML spec matches its labels
 * case-insensitively (the rendered labels are "SAML identity provider URL").
 */
export async function typeAndBlurUsingLabel(
  page: Page,
  label: string | RegExp,
  value: string,
) {
  const field = page.getByLabel(label);
  await field.click();
  await field.fill(value);
  await field.blur();
}

/** Port of H.goToAuthOverviewPage (e2e-misc-helpers.js:443). */
export async function goToAuthOverviewPage(page: Page) {
  await page
    .getByTestId("admin-layout-sidebar")
    .getByText("Overview", { exact: true })
    .click();
}

/**
 * Port of the spec-local enterSamlSettings.
 *
 * Upstream pastes the certificate with `.invoke("val", cert)` and then types
 * "a{backspace}" purely to make React notice the value. Playwright's `fill`
 * sets the value AND dispatches the input event Formik listens on, so it is
 * the same end state in one step.
 */
export async function enterSamlSettings(page: Page, certificate: string) {
  await typeAndBlurUsingLabel(
    page,
    /SAML Identity Provider URL/i,
    "https://example.test",
  );
  await typeAndBlurUsingLabel(
    page,
    /SAML Identity Provider Issuer/i,
    "https://example.test/issuer",
  );
  await typeAndBlurUsingLabel(
    page,
    /SAML Identity Provider Certificate/i,
    certificate,
  );
}

// === group mappings widget ===

/**
 * Counts responses matching `predicate` from the moment it is called.
 *
 * Port of `cy.wait(["@alias", "@alias"])`: three concurrent waitForResponse
 * calls on one predicate would all resolve on the first hit (PORTING), so the
 * n-of-a-kind wait has to be a counter. Register before the triggering action.
 */
function countResponses(page: Page, predicate: (response: Response) => boolean) {
  let count = 0;
  const handler = (response: Response) => {
    if (predicate(response)) {
      count += 1;
    }
  };
  page.on("response", handler);

  return {
    async waitFor(n: number) {
      try {
        await expect
          .poll(() => count, { timeout: 30_000 })
          .toBeGreaterThanOrEqual(n);
      } finally {
        page.off("response", handler);
      }
    },
  };
}

function isDeleteGroup(response: Response) {
  return (
    response.request().method() === "DELETE" &&
    /^\/api\/permissions\/group\/\d+$/.test(new URL(response.url()).pathname)
  );
}

function isClearGroup(response: Response) {
  return (
    response.request().method() === "PUT" &&
    /^\/api\/permissions\/membership\/\d+\/clear$/.test(
      new URL(response.url()).pathname,
    )
  );
}

function adminContentTable(page: Page): Locator {
  return page.getByTestId("admin-content-table");
}

/** The mappings table row carrying `name` (Cypress: findByText(name).closest("tr")). */
function mappingRow(page: Page, name: string): Locator {
  // The `has` sub-locator must be built from `page`, never from a Locator
  // scope, or it gets re-anchored and never resolves (PORTING, wave 11).
  return adminContentTable(page)
    .locator("tbody tr")
    .filter({ has: page.getByText(name, { exact: true }) });
}

/**
 * The group-mappings settings page for an auth method, with the two GETs the
 * Cypress spec aliases (`@getSettings`, `@getSessionProperties`) awaited.
 */
export async function visitAuthSettings(page: Page, method: string) {
  const settings = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/setting",
  );
  const sessionProperties = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/session/properties",
  );
  await page.goto(`/admin/settings/authentication/${method}`);
  await settings;
  await sessionProperties;
}

/** Port of createMapping (group-mappings-widget.js). */
async function createMapping(page: Page, name: string) {
  await page.getByRole("button", { name: "New mapping", exact: true }).click();
  await page.getByLabel("New group mapping name", { exact: true }).fill(name);
  // The Add button only enables once the name is non-empty and unique.
  const addButton = page.getByRole("button", { name: "Add", exact: true });
  await expect(addButton).toBeEnabled();
  const saved = waitForMappingSettingPut(page);
  await addButton.click();
  await saved;
  await expect(mappingRow(page, name)).toBeVisible();
}

/** The PUT that persists a mapping change (redux updateSetting → /api/setting/:key). */
function waitForMappingSettingPut(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.startsWith("/api/setting/"),
  );
}

/** Port of addGroupsToMapping (group-mappings-widget.js). */
async function addGroupsToMapping(page: Page, name: string, groups: string[]) {
  // The row's GroupSelect target reads "Default" while nothing is selected.
  await mappingRow(page, name).getByText("Default", { exact: true }).click();

  for (const group of groups) {
    const option = page.getByRole("option", { name: group, exact: true });
    await option.click();
    // Wait for the selection to round-trip before picking the next group.
    await expect(option.locator("input[type=checkbox]")).toBeChecked();
  }

  // Park the real cursor before the Escape: content rendering under it opens a
  // Mantine tooltip whose useDismiss swallows the key (PORTING, wave 9).
  await page.mouse.move(0, 0);
  await page.keyboard.press("Escape");
}

/** Port of deleteMappingWithGroups (group-mappings-widget.js). */
async function deleteMappingWithGroups(page: Page, name: string) {
  await icon(mappingRow(page, name), "close").click({ force: true });

  await page.getByText(/delete the groups/i).click();
  await page
    .getByRole("button", { name: "Remove mapping and delete groups" })
    .click();
}

/** Port of checkThatGroupHasNoMembers (group-mappings-widget.js). */
async function checkThatGroupHasNoMembers(page: Page, name: string) {
  const row = page
    .locator("tr")
    .filter({ has: page.getByText(name, { exact: true }) });
  await expect(row.getByText("0", { exact: true })).toBeVisible();
}

/** Port of crudGroupMappingsWidget(authenticationMethod). */
export async function crudGroupMappingsWidget(page: Page, method: string) {
  await visitAuthSettings(page, method);

  // Create mapping, then delete it along with its groups
  await createMapping(page, "cn=People1");
  await addGroupsToMapping(page, "cn=People1", [
    "Administrators",
    "data",
    "nosql",
  ]);

  const deletedGroups = countResponses(page, isDeleteGroup);
  await deleteMappingWithGroups(page, "cn=People1");
  await deletedGroups.waitFor(2);

  // Create mapping, then clear its groups of members
  await createMapping(page, "cn=People2");
  await addGroupsToMapping(page, "cn=People2", ["collection", "readonly"]);
  // Groups deleted along with first mapping should not be offered
  await expect(page.getByText("data", { exact: true })).toHaveCount(0);
  await expect(page.getByText("nosql", { exact: true })).toHaveCount(0);

  await icon(adminContentTable(page), "close").click({ force: true });
  await page.getByText(/remove all group members/i).click();

  const clearedGroups = countResponses(page, isClearGroup);
  await page
    .getByRole("button", { name: "Remove mapping and members" })
    .click();
  await clearedGroups.waitFor(2);

  await page.goto("/admin/people/groups");
  // Anchor: the groups table has rendered, so the absence checks below are not
  // passing vacuously against a still-loading page (PORTING, batch 12).
  // (the group links read "A All Users" — the avatar initial is part of the
  // accessible name — so match on a substring)
  await expect(page.getByRole("link", { name: /All Users/ })).toBeVisible();
  await expect(page.getByText("data", { exact: true })).toHaveCount(0);
  await expect(page.getByText("nosql", { exact: true })).toHaveCount(0);

  await checkThatGroupHasNoMembers(page, "collection");
  await checkThatGroupHasNoMembers(page, "readonly");
}

/** Port of checkGroupConsistencyAfterDeletingMappings(authenticationMethod). */
export async function checkGroupConsistencyAfterDeletingMappings(
  page: Page,
  method: string,
) {
  await visitAuthSettings(page, method);

  await createMapping(page, "cn=People1");
  await addGroupsToMapping(page, "cn=People1", [
    "Administrators",
    "data",
    "nosql",
  ]);

  await createMapping(page, "cn=People2");
  await addGroupsToMapping(page, "cn=People2", ["data", "collection"]);

  await createMapping(page, "cn=People3");
  await addGroupsToMapping(page, "cn=People3", ["collection", "readonly"]);

  const deletedGroups = countResponses(page, isDeleteGroup);
  await deleteMappingWithGroups(page, "cn=People2");
  // cn=People2 held `data` and `collection`; both are deleted.
  await deletedGroups.waitFor(2);

  // Scope to the table: the group dropdown is portaled and stays mounted
  // (hidden) after being opened, so a group name can also linger as an
  // off-screen option outside the table.
  const table = adminContentTable(page);
  // cn=People1 will have Admin and nosql as groups
  await expect(table.getByText("1 other group", { exact: true })).toBeVisible();
  // cn=People3 will have readonly as group
  await expect(table.getByText("readonly", { exact: true })).toBeVisible();

  // Ensure mappings are as expected after a page reload
  await visitAuthSettings(page, method);
  await expect(table.getByText("1 other group", { exact: true })).toBeVisible();
  await expect(table.getByText("readonly", { exact: true })).toBeVisible();
}
