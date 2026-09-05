/**
 * Port of e2e/test/scenarios/admin-2/api-keys.cy.spec.ts
 * (Admin > Settings > API keys: create/edit/delete/regenerate an API key,
 * group assignment, validation, and using a key to create/edit content).
 *
 * Port notes:
 * - The Cypress beforeEach registers a GET /api/permissions/group intercept
 *   ("@getGroups") that is never awaited — dropped (rule 2).
 * - The generated key value is asserted through the UI exactly as the original
 *   does (prefix/format via toHaveValue(/mb_/)); it is never logged or echoed.
 */
import { test, expect } from "../support/fixtures";
import {
  ADMINISTRATORS_GROUP_ID,
  ALL_USERS_GROUP_ID,
  NOSQL_GROUP_ID,
  READONLY_GROUP_ID,
  apiKeyRow,
  createApiKey,
  createDashboardForApiKey,
  createQuestionForApiKey,
  editDashboardForApiKey,
  editQuestionForApiKey,
  tryToCreateApiKeyViaModal,
  visitApiKeySettings,
  waitForDeleteKey,
  waitForGetKeyCount,
  waitForGetKeys,
  waitForRegenerateKey,
  waitForUpdateKey,
} from "../support/api-keys";
import { sidesheet } from "../support/revisions";
import { ORDERS_DASHBOARD_ID, ORDERS_QUESTION_ID } from "../support/sample-data";
import { modal, visitDashboard, visitQuestion } from "../support/ui";

test.describe("scenarios > admin > settings > API keys", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should show number of API keys on auth card", async ({ page, mb }) => {
    const keyCount1 = waitForGetKeyCount(page);
    await page.goto("/admin/settings/authentication");
    await keyCount1;

    await expect(
      page.getByTestId("api-keys-setting").getByText("API Keys", { exact: true }),
    ).toBeVisible();

    await createApiKey(mb, "Test API Key One", ALL_USERS_GROUP_ID);

    const keyCount2 = waitForGetKeyCount(page);
    await page.reload();
    await keyCount2;

    await expect(
      page
        .getByTestId("api-keys-setting")
        .getByTestId("card-badge")
        .getByText("1 API Key", { exact: true }),
    ).toBeVisible();

    await createApiKey(mb, "Test API Key Two", ALL_USERS_GROUP_ID);
    await createApiKey(mb, "Test API Key Three", ALL_USERS_GROUP_ID);

    const keyCount3 = waitForGetKeyCount(page);
    await page.reload();
    await keyCount3;

    await expect(
      page
        .getByTestId("api-keys-setting")
        .getByTestId("card-badge")
        .getByText("3 API Keys", { exact: true }),
    ).toBeVisible();
  });

  test("should list existing API keys", async ({ page, mb }) => {
    await createApiKey(mb, "Test API Key One", ALL_USERS_GROUP_ID);
    await createApiKey(mb, "Test API Key Two", NOSQL_GROUP_ID);
    await createApiKey(mb, "Test API Key Three", READONLY_GROUP_ID);

    await visitApiKeySettings(page);

    const table = page.getByTestId("api-keys-table");
    await expect(table.getByText("Test API Key One", { exact: true })).toBeVisible();
    await expect(table.getByText("All Users", { exact: true })).toBeVisible();

    await expect(table.getByText("Test API Key Two", { exact: true })).toBeVisible();
    await expect(table.getByText("nosql", { exact: true })).toBeVisible();

    await expect(
      table.getByText("Test API Key Three", { exact: true }),
    ).toBeVisible();
    await expect(table.getByText("readonly", { exact: true })).toBeVisible();

    // masked key prefix
    await expect(table.getByText(/mb_/).first()).toBeVisible();
    // modifier
    await expect(table.getByText("Bobby Tables").first()).toBeVisible();
  });

  test("should allow creating an API key", async ({ page }) => {
    const name = "New key";
    const group = "Administrators";
    await visitApiKeySettings(page);

    const getKeys = waitForGetKeys(page);
    await tryToCreateApiKeyViaModal(page, { name, group });
    await getKeys;

    await expect(
      page
        .getByLabel("Copy and save this API key", { exact: true })
        .getByLabel(/the api key/i),
    ).toBeVisible();

    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByTestId("api-keys-table").getByText(name, { exact: true }),
    ).toBeVisible();
  });

  test("should show an error when a previously used key name is submitted", async ({
    page,
  }) => {
    const name = "New key";
    const group = "Administrators";
    await visitApiKeySettings(page);
    await tryToCreateApiKeyViaModal(page, { name, group });
    await page.getByRole("button", { name: "Done", exact: true }).click();

    const response = await tryToCreateApiKeyViaModal(page, { name, group });
    expect(response.status()).toBe(400);

    await expect(
      page
        .getByTestId("create-api-key-modal")
        .getByRole("alert")
        .filter({ hasText: "An API key with this name already exists." }),
    ).toBeVisible();
  });

  test("should allow deleting an API key", async ({ page, mb }) => {
    await createApiKey(mb, "Test API Key One", ALL_USERS_GROUP_ID);
    await visitApiKeySettings(page);

    await apiKeyRow(page, "Test API Key One")
      .getByLabel("API key actions")
      .click();
    await page.getByRole("menuitem", { name: /delete/i }).click();

    const deleteKey = waitForDeleteKey(page);
    const getKeys = waitForGetKeys(page);
    await modal(page)
      .getByRole("button", { name: "Delete API key", exact: true })
      .click();
    await deleteKey;
    await getKeys;

    await expect(
      page.getByTestId("empty-table-warning").getByText("No API keys yet"),
    ).toBeVisible();
  });

  test("should allow editing an API key", async ({ page, mb }) => {
    await createApiKey(mb, "Development API Key", ALL_USERS_GROUP_ID);
    await visitApiKeySettings(page);

    const table = page.getByTestId("api-keys-table");
    await expect(table).toContainText("Development API Key");
    await expect(table).toContainText("All Users");

    await apiKeyRow(page, "Development API Key")
      .getByLabel("API key actions")
      .click();
    await page.getByRole("menuitem", { name: /edit/i }).click();

    await page.getByLabel(/Key name/).fill("Different key name");

    await page.getByLabel(/group/i).click();
    await page
      .getByRole("listbox")
      .getByText("collection", { exact: true })
      .click();

    const updateKey = waitForUpdateKey(page);
    const getKeys = waitForGetKeys(page);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await updateKey;
    await getKeys;

    await expect(table).not.toContainText("Development API Key");
    await expect(apiKeyRow(page, "Different key name")).toContainText(
      "collection",
    );
  });

  test("should allow regenerating an API key", async ({ page, mb }) => {
    await createApiKey(mb, "Personal API Key", ALL_USERS_GROUP_ID);

    await visitApiKeySettings(page);
    await apiKeyRow(page, "Personal API Key")
      .getByLabel("API key actions")
      .click();
    await page.getByRole("menuitem", { name: /edit/i }).click();
    await page
      .getByRole("button", { name: "Regenerate API key", exact: true })
      .click();

    const regenerateKey = waitForRegenerateKey(page);
    const getKeys = waitForGetKeys(page);
    await page.getByRole("button", { name: "Regenerate", exact: true }).click();
    await regenerateKey;

    await expect(page.getByLabel("The API key", { exact: true })).toHaveValue(
      /mb_/,
    );

    const getKeysResponse = await getKeys;
    const body = await getKeysResponse.json();
    const { created_at, updated_at } = body?.[0] ?? {};
    // after regeneration, created_at and updated_at should be different
    // they're too close to check via UI though
    expect(created_at).not.toBe(updated_at);

    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByTestId("api-keys-table").getByText(/mb_/).first(),
    ).toBeVisible();
  });

  test.describe("api key actions", () => {
    test("should allow creating questions and dashboards with an API key", async ({
      page,
      mb,
    }) => {
      const { unmasked_key: apiKey } = await createApiKey(
        mb,
        "Test API Key One",
        ADMINISTRATORS_GROUP_ID,
      );

      const { id: questionId } = await createQuestionForApiKey(mb, apiKey);
      await mb.signInAsAdmin();
      await visitQuestion(page, questionId);
      await expect(
        page.getByTestId("qb-header").getByText("Test Question", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("view-footer")
          .getByText("Showing 22 rows", { exact: true }),
      ).toBeVisible();

      await page.getByTestId("qb-header-info-button").click();
      await sidesheet(page)
        .getByRole("tab", { name: "History" })
        .click();
      await expect(
        sidesheet(page).getByText("Test API Key One created this.", {
          exact: true,
        }),
      ).toBeVisible();

      const { id: dashboardId } = await createDashboardForApiKey(mb, apiKey);
      await mb.signInAsAdmin();
      await visitDashboard(page, mb.api, dashboardId);
      await expect(
        page
          .getByTestId("dashboard-header")
          .getByText("Test Dashboard", { exact: true }),
      ).toBeVisible();
      await page
        .getByTestId("dashboard-header")
        .locator(".Icon-info")
        .click();
      await sidesheet(page)
        .getByRole("tab", { name: "History" })
        .click();
      await expect(
        sidesheet(page).getByText("Test API Key One created this.", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should allow editing questions and dashboards with an api key", async ({
      page,
      mb,
    }) => {
      const { unmasked_key: apiKey } = await createApiKey(
        mb,
        "Test API Key One",
        ADMINISTRATORS_GROUP_ID,
      );

      await editQuestionForApiKey(
        mb,
        apiKey,
        ORDERS_QUESTION_ID,
        "Edited Question Name",
      );
      await mb.signInAsAdmin();
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await expect(
        page
          .getByTestId("qb-header")
          .getByText("Edited Question Name", { exact: true }),
      ).toBeVisible();
      await page.getByTestId("qb-header-info-button").click();
      await sidesheet(page)
        .getByRole("tab", { name: "History" })
        .click();
      await expect(
        sidesheet(page).getByText("You created this.", { exact: true }),
      ).toBeVisible();
      await expect(
        sidesheet(page).getByText(
          'Test API Key One renamed this Card from "Orders" to "Edited Question Name".',
          { exact: true },
        ),
      ).toBeVisible();

      await editDashboardForApiKey(
        mb,
        apiKey,
        ORDERS_DASHBOARD_ID,
        "Edited Dashboard Name",
      );
      await mb.signInAsAdmin();
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        page
          .getByTestId("dashboard-header")
          .getByText("Edited Dashboard Name", { exact: true }),
      ).toBeVisible();
      await page
        .getByTestId("dashboard-header")
        .locator(".Icon-info")
        .click();
      await sidesheet(page)
        .getByRole("tab", { name: "History" })
        .click();
      await expect(
        sidesheet(page).getByText("You created this.", { exact: true }),
      ).toBeVisible();
      await expect(
        sidesheet(page).getByText(
          'Test API Key One renamed this Dashboard from "Orders in a dashboard" to "Edited Dashboard Name".',
          { exact: true },
        ),
      ).toBeVisible();
    });
  });
});
