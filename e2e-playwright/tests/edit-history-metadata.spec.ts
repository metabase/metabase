/**
 * Playwright port of e2e/test/scenarios/organization/edit-history-metadata.cy.spec.js
 *
 * The Cypress findByDisplayValue calls resolve to the EditableText textareas
 * (the data-testid lands on the textarea itself), so the ports target the
 * testids and assert the value before typing — fill() doesn't mark
 * EditableText dirty, hence click + pressSequentially + blur anchored on the
 * PUT (the wave-5 hardened rename pattern).
 */
import type { Locator, Page } from "@playwright/test";

import { test, expect } from "../support/fixtures";
import { USER_DISPLAY_NAMES } from "../support/organization-extras";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import { collectionTable, visitDashboard, visitQuestion } from "../support/ui";

test.describe("scenarios > collection items metadata", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test.describe("last edit date", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
    });

    test("should display last edit moment for dashboards", async ({
      page,
      mb,
    }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await changeDashboard(page);
      await expect(page.getByText(/Edited a few seconds ago/i)).toBeVisible();
    });

    test("should display last edit moment for questions", async ({ page }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await changeQuestion(page);
      await expect(page.getByText(/Edited a few seconds ago/i)).toBeVisible();
    });
  });

  test.describe("last editor", () => {
    test("should display if user is the last editor", async ({ page, mb }) => {
      await mb.signInAsAdmin();
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(page.getByText(/Edited .* by you/i)).toBeVisible();
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await expect(page.getByText(/Edited .* by you/i)).toBeVisible();
      await mb.signOut();
    });

    test("should display last editor's name", async ({ page, mb }) => {
      const { first_name, last_name } = USER_DISPLAY_NAMES.admin;
      // Example: John Doe —> John D.
      const expectedName = `${first_name} ${last_name.charAt(0)}.`;

      await mb.signIn("normal");
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        page.getByText(new RegExp(`Edited .* by ${expectedName}`, "i")),
      ).toBeVisible();
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await expect(
        page.getByText(new RegExp(`Edited .* by ${expectedName}`, "i")),
      ).toBeVisible();
    });

    test("should change last editor when another user changes item", async ({
      page,
      mb,
    }) => {
      const { first_name, last_name } = USER_DISPLAY_NAMES.normal;
      const fullName = `${first_name} ${last_name}`;

      await mb.signIn("normal");
      await page.goto("/collection/root");

      // Ensure nothing is edited by current user,
      // otherwise the test is irrelevant. Wait for the table to render
      // before the not-exist check — a count-0 assertion passes trivially
      // against an empty page.
      await expect(
        collectionTable(page).getByText("Orders", { exact: true }),
      ).toBeVisible();
      await expect(
        collectionTable(page).getByText(fullName, { exact: true }),
      ).toHaveCount(0);
      await collectionTable(page).getByText("Orders", { exact: true }).click();

      await changeQuestion(page);

      await page.goto("/collection/root");
      await collectionTable(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();

      await changeDashboard(page);

      await page.goto("/collection/root");
      await expect(
        getTableRowFor(page, "Orders!").getByText(fullName, { exact: true }),
      ).toBeVisible();
      await expect(
        getTableRowFor(page, "Dash").getByText(fullName, { exact: true }),
      ).toBeVisible();
    });
  });
});

async function changeDashboard(page: Page) {
  const titleInput = page.getByTestId("dashboard-name-heading");
  await titleInput.click();
  await expect(titleInput).toHaveValue("Orders in a dashboard");
  await titleInput.press("ControlOrMeta+a");
  await titleInput.pressSequentially("Dash");
  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.startsWith("/api/dashboard/"),
  );
  await titleInput.blur();
  await updated;
}

async function changeQuestion(page: Page) {
  const titleInput = page.getByTestId("saved-question-header-title");
  await titleInput.click();
  await expect(titleInput).toHaveValue("Orders");
  await titleInput.press("End");
  await titleInput.pressSequentially("!");
  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.startsWith("/api/card/"),
  );
  await titleInput.blur();
  await updated;
}

function getTableRowFor(page: Page, name: string): Locator {
  return collectionTable(page)
    .getByRole("row")
    .filter({ has: page.getByText(name, { exact: true }) });
}
