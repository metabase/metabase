/**
 * Helpers for the admin > tools > help port
 * (e2e/test/scenarios/admin/tools/help.cy.spec.ts).
 *
 * Ports:
 * - mockSessionPropertiesTokenFeatures (e2e/support/helpers/e2e-enterprise-helpers.js)
 * - the spec-local executeCreateGrantAccessFlow (the "helping hand" describe)
 */
import type { Page } from "@playwright/test";

import { expect } from "./fixtures";
import { undoToast } from "./metrics";

/**
 * Port of H.mockSessionPropertiesTokenFeatures: intercept GET
 * /api/session/properties and merge the given features into `token-features`.
 * Native fetch instead of route.fetch() — the latter chokes on the backend's
 * set-cookie headers under bun (same workaround as mockSessionProperty in
 * admin-extras.ts). Register before page.goto; persists across reloads.
 */
export async function mockSessionPropertiesTokenFeatures(
  page: Page,
  features: Record<string, boolean>,
) {
  await page.route(
    (url) => url.pathname === "/api/session/properties",
    async (route) => {
      const request = route.request();
      const response = await fetch(request.url(), {
        headers: await request.allHeaders(),
      });
      const body = (await response.json()) as Record<string, unknown>;
      const tokenFeatures = (body["token-features"] ?? {}) as Record<
        string,
        unknown
      >;
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify({
          ...body,
          "token-features": { ...tokenFeatures, ...features },
        }),
      });
    },
  );
}

type DurationOption = "96 hours" | "48 hours" | "24 hours";

/**
 * Port of the spec-local executeCreateGrantAccessFlow: open the grant-access
 * modal, optionally set duration/ticket/notes, submit, and assert the success
 * toast.
 */
export async function executeCreateGrantAccessFlow(
  page: Page,
  {
    durationOption,
    ticket,
    notes,
  }: { durationOption?: DurationOption; ticket?: string; notes?: string } = {},
) {
  await expect(page.getByTestId("access-grant-list-table")).toHaveCount(0);

  const requestButton = page.getByRole("button", {
    name: "Request a helping hand",
    exact: true,
  });
  await expect(requestButton).toBeEnabled();
  await requestButton.click();

  // The data-testid sits on Mantine's Modal *root* — a zero-size positioning
  // container — so a toBeVisible() on it reports hidden even when the modal is
  // open. Gate on the modal's visible heading instead (upstream's within-scope
  // `should("be.visible")` on the root passed only because Cypress visibility
  // treats a wrapper as visible when a descendant is).
  const grantModal = page.getByTestId("grant-access-modal");
  await expect(
    grantModal.getByRole("heading", { name: "Grant Access?", exact: true }),
  ).toBeVisible();

  if (durationOption) {
    await grantModal.getByLabel(/Access duration/).click();
    // The Mantine Select dropdown portals outside the modal (Cypress used
    // cy.document().findByRole("listbox")); pick the option by role rather than
    // clicking the text div (wave-10 Mantine-Select gotcha).
    await page
      .getByRole("listbox")
      .getByRole("option", { name: new RegExp(durationOption) })
      .click();
  }

  if (ticket) {
    await grantModal.getByLabel("Ticket", { exact: true }).fill(ticket);
  }
  if (notes) {
    await grantModal.getByLabel("Notes", { exact: true }).fill(notes);
  }

  await grantModal
    .getByRole("button", { name: "Grant access", exact: true })
    .click();

  await expect(
    undoToast(page)
      .filter({ hasText: "Access grant created successfully" })
      .first(),
  ).toBeVisible();
}
