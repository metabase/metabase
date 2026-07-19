/**
 * Helpers for the whitelabel / appearance-settings port
 * (e2e/test/scenarios/admin-2/whitelabel.cy.spec.js). New module per the
 * porting rules — imports the shared helpers read-only, adds nothing to them.
 *
 * The image assets (logo.jpeg, favicon.ico) live under e2e/support/assets and
 * are read at module load, mirroring the Cypress spec's cy.readFile("…","base64").
 */
import fs from "fs";
import path from "path";

import { Locator, Page, expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { getHelpSubmenu } from "./command-palette";
import { selectDropdown } from "./dashboard";

const ASSETS_DIR = path.resolve(__dirname, "../../e2e/support/assets");

export const LOGO_PATH = path.join(ASSETS_DIR, "logo.jpeg");
export const FAVICON_PATH = path.join(ASSETS_DIR, "favicon.ico");

/** logo.jpeg as a base64 data URI — how the spec stores the logo setting and
 * asserts on the rendered <img src> / background-image. */
export const LOGO_BASE64 = fs.readFileSync(LOGO_PATH, "base64");
export const LOGO_DATA_URI = `data:image/jpeg;base64,${LOGO_BASE64}`;

/** favicon.ico as a base64 data URI (the spec uploads it with mimeType
 * image/jpeg, so the stored value carries the jpeg prefix). */
export const FAVICON_BASE64 = fs.readFileSync(FAVICON_PATH, "base64");
export const FAVICON_DATA_URI = `data:image/jpeg;base64,${FAVICON_BASE64}`;

export const MB = 1024 * 1024;

/**
 * Port of the spec-local checkFavicon: GET the setting and assert the value
 * contains the expected URL (the endpoint returns the stored string). */
export async function checkFavicon(api: MetabaseApi, url: string) {
  const response = await api.get("/api/setting/application-favicon-url");
  // A string setting's GET returns the raw value as text/plain, not JSON.
  const body = await response.text();
  expect(body).toContain(url);
}

/**
 * Port of the spec-local checkLogo: the logo is stored as a data URI, so an
 * <img> renders it verbatim. */
export async function checkLogo(page: Page) {
  await expect(
    page.locator(`img[src="${LOGO_DATA_URI}"]`).first(),
  ).toBeVisible();
}

/**
 * Port of the spec-local changeLoadingMessage: on the whitelabel page pick a
 * loading message from the dropdown and wait for it to persist. */
export async function changeLoadingMessage(page: Page, message: string) {
  await page.goto("/admin/settings/whitelabel");
  await page.getByLabel("Loading message", { exact: true }).click();
  const putLoadingMessage = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/setting/loading-message",
  );
  await selectDropdown(page).getByText(message, { exact: true }).click();
  await putLoadingMessage;
}

/** Port of the spec-local setApplicationFontTo (H.updateSetting). */
export async function setApplicationFontTo(api: MetabaseApi, font: string) {
  await api.updateSetting("application-font", font);
}

/** Port of the spec-local helpLink: the "Get help" item in the help submenu. */
export function helpLink(page: Page): Locator {
  return getHelpSubmenu(page).getByRole("menuitem", {
    name: "Get help",
    exact: true,
  });
}

/** Port of the spec-local getHelpLinkCustomDestinationInput. */
export function getHelpLinkCustomDestinationInput(page: Page): Locator {
  return page.getByPlaceholder("Enter a URL it should go to", { exact: true });
}
