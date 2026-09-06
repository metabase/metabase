/**
 * Helpers for the public-sharing admin-settings spec
 * (e2e/test/scenarios/sharing/public-sharing.cy.spec.js).
 *
 * The Cypress original POSTs `/api/<type>/:id/public_link` directly and drives
 * the /admin/settings/public-sharing page (shared listings + revoke). Existing
 * factory / API helpers (createQuestion, createQuestionAndDashboard,
 * createAction, setActionsEnabledForDB, visitDashboardAndCreateTab) are imported
 * read-only from their shared modules; only the public-link + admin-page bits
 * that no other port needed live here.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { modal } from "./ui";

export const PUBLIC_SHARING_SETTINGS_URL = "/admin/settings/public-sharing";

type PublicResourceType = "card" | "dashboard" | "action";

/**
 * Port of the spec's `cy.request("POST", "/api/<type>/:id/public_link", {})`:
 * mint a public link and return its uuid.
 */
export async function createPublicLink(
  api: MetabaseApi,
  type: PublicResourceType,
  id: number,
): Promise<string> {
  const response = await api.post(`/api/${type}/${id}/public_link`, {});
  const { uuid } = (await response.json()) as { uuid: string };
  return uuid;
}

/**
 * The public-sharing page fires three list requests on load
 * (`GET /api/{action,dashboard,card}/public`) — the spec's
 * `cy.wait(["@getPublicActions", "@getPublicQuestions", "@getPublicDashboards"])`.
 * Register the wait BEFORE navigating, then await the returned promise after.
 */
export function waitForPublicListings(page: Page): Promise<unknown> {
  const paths = [
    "/api/action/public",
    "/api/dashboard/public",
    "/api/card/public",
  ];
  return Promise.all(
    paths.map((path) =>
      page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === path,
      ),
    ),
  );
}

/**
 * Port of the spec's revoke flow: click a listing's "Revoke link" icon, confirm
 * the "Disable this link?" modal.
 */
export async function revokePublicLink(page: Page) {
  // Cypress `cy.button("Revoke link")` takes the first match.
  await page.getByRole("button", { name: "Revoke link" }).first().click();
  const dialog = modal(page);
  await expect(dialog.getByText("Disable this link?")).toBeVisible();
  await dialog.getByRole("button", { name: "Yes" }).click();
}
