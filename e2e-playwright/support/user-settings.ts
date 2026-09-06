/**
 * Helpers for the user-settings spec (onboarding/setup/user_settings). Lives in
 * its own module so the shared support files stay untouched — it imports the
 * shared findByDisplayValue rather than re-implementing it.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import { getProfileLink } from "./command-palette";
import { findByDisplayValue } from "./filters-repros";
import { popover } from "./ui";

/**
 * The `normal` user, mirroring e2e/support/cypress_data.js USERS.normal:
 * first/last names come from cypress_data.js (untyped JS outside tsconfig),
 * email/password match support/sample-data.ts USERS.normal.
 */
export const NORMAL_USER = {
  first_name: "Robert",
  last_name: "Tableton",
  email: "normal@metabase.test",
  password: "12341234",
} as const;

/** Port of NORMAL_USER_ID (e2e/support/cypress_sample_instance_data.js). */
export const NORMAL_USER_ID = (() => {
  const user = SAMPLE_INSTANCE_DATA.users.find(
    ({ email }) => email === NORMAL_USER.email,
  );
  if (!user) {
    throw new Error("normal user not found in cypress_sample_instance_data");
  }
  return user.id;
})();

/** Port of H.getFullName(normal). */
export function getFullName(): string {
  return `${NORMAL_USER.first_name} ${NORMAL_USER.last_name}`;
}

// The body background-color values the Cypress spec asserts verbatim: the app
// paints them as computed-style strings, so Chromium (Cypress' Chrome and our
// bundled Chromium alike) returns exactly these.
const LIGHT_MODE_BG = "rgb(249, 249, 250)";
const DARK_MODE_BG = "color(srgb 0.0204 0.06792 0.0996)";

/** Port of the spec-local assertLightMode. */
export async function assertLightMode(page: Page) {
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    LIGHT_MODE_BG,
  );
}

/** Port of the spec-local assertDarkMode. */
export async function assertDarkMode(page: Page) {
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_MODE_BG);
}

/** The color-scheme Select on /account/profile, matched by its current value. */
export function colorSchemeInput(page: Page, value: string): Promise<Locator> {
  return findByDisplayValue(page.getByRole("main"), value);
}

/**
 * Port of the spec-local stubCurrentUser: replace GET /api/user/current with
 * the real user merged with the given authentication method. Register before
 * navigating; await getUser() afterwards. Mirrors mockSessionProperty's
 * fetch-real-then-fulfil pattern (survives the per-worker slot URL because the
 * request's own url + cookies are forwarded).
 */
export async function stubCurrentUser(
  page: Page,
  authenticationMethod: Record<string, unknown>,
) {
  await page.route(
    (url) => url.pathname === "/api/user/current",
    async (route) => {
      const request = route.request();
      const response = await fetch(request.url(), {
        headers: await request.allHeaders(),
      });
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify({ ...body, ...authenticationMethod }),
      });
    },
  );
}

/** Port of H.goToProfile: open the profile menu and click "Account settings". */
export async function goToProfile(page: Page) {
  await getProfileLink(page).click();
  await popover(page).getByTestId("mode-switcher-profile-link").click();
}

/** Register a wait for the next GET /api/user/current (cy.wait("@getUser")). */
export function waitForGetUser(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/user/current",
  );
}
