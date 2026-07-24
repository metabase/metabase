/**
 * Playwright port of e2e/test/scenarios/data-reference/glossary.cy.spec.ts
 *
 * - Cypress asserted the POST/PUT request bodies inside cy.intercept
 *   callbacks; here the same deep-equal assertions run on
 *   response.request().postDataJSON() after awaiting the matching response.
 * - Snowplow helpers run real assertions, backed by the per-slot collector via
 *   ../support/snowplow — the tracking tests exercise the UI flows too.
 * - The "data studio > glossary" describe needs the pro-self-hosted token.
 */
import type { Page } from "@playwright/test";

import { resolveToken } from "../support/api";
import type { MetabaseApi } from "../support/api";
import { dataStudioNav, visitDataStudio } from "../support/data-reference";
import { test, expect } from "../support/fixtures";
import {
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";

async function executeCreateGlossaryTermFlow(page: Page) {
  await page.getByRole("button", { name: /new term/i }).click();

  await page.getByPlaceholder(/boat/i).fill("  Boat  ");
  await page
    .getByPlaceholder(/a small vessel.*/i)
    .fill("  A small vessel for traveling on water.  ");

  const createGlossary = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/glossary",
  );
  await page.getByLabel("Save", { exact: true }).click();
  const response = await createGlossary;
  expect(response.request().postDataJSON()).toEqual({
    term: "Boat",
    definition: "A small vessel for traveling on water.",
  });

  const table = page.locator("table");
  await expect(table.getByText("Boat", { exact: true })).toBeVisible();
  await expect(
    table.getByText("A small vessel for traveling on water.", {
      exact: true,
    }),
  ).toBeVisible();
}

async function executeUpdateGlossaryTermFlow(
  page: Page,
  api: MetabaseApi,
  visitPage: () => Promise<void>,
) {
  const createResponse = await api.post("/api/glossary", {
    term: "Cat",
    definition: "Meows",
  });
  const { id } = (await createResponse.json()) as { id: number };

  await visitPage();

  const table = page.locator("table");
  await table.getByText("Cat", { exact: true }).click();

  await page.getByPlaceholder(/boat/i).fill("Kitten");
  await page.getByPlaceholder(/a small vessel.*/i).fill("Young cat");

  const updateGlossary = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/glossary/${id}`,
  );
  await page.getByRole("button", { name: /save/i }).click();
  const response = await updateGlossary;
  expect(response.request().postDataJSON()).toEqual({
    term: "Kitten",
    definition: "Young cat",
  });

  await expect(table.getByText("Kitten", { exact: true })).toBeVisible();
  await expect(table.getByText("Young cat", { exact: true })).toBeVisible();
}

async function executeDeleteGlossaryTermFlow(
  page: Page,
  api: MetabaseApi,
  visitPage: () => Promise<void>,
) {
  const createResponse = await api.post("/api/glossary", {
    term: "DeleteMe",
    definition: "To be removed",
  });
  const { id } = (await createResponse.json()) as { id: number };

  await visitPage();

  const table = page.locator("table");
  await expect(table.getByText("DeleteMe", { exact: true })).toBeVisible();
  // The row's delete action only appears on hover.
  await table.getByText("DeleteMe", { exact: true }).hover();
  await table.getByRole("button", { name: /delete/i }).click();

  const deleteGlossary = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      new URL(response.url()).pathname === `/api/glossary/${id}`,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /delete/i })
    .click();
  await deleteGlossary;

  await expect(table.getByText("DeleteMe", { exact: true })).toHaveCount(0);
}

test.describe("data reference > glossary", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  async function visitGlossary(page: Page) {
    await page.goto("/reference/glossary");
  }

  test("fetches existing definitions", async ({ page }) => {
    await page.route("**/api/glossary", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: [
                { id: 1, term: "Alpha", definition: "First" },
                { id: 2, term: "Beta", definition: "Second" },
              ],
            }),
          })
        : route.fallback(),
    );

    const getGlossary = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/glossary",
    );
    await visitGlossary(page);
    await getGlossary;

    const table = page.locator("table");
    await expect(table.getByText("Alpha", { exact: true })).toBeVisible();
    await expect(table.getByText("Beta", { exact: true })).toBeVisible();
  });

  test("creates a new definition and makes POST /api/glossary with trimmed values", async ({
    page,
  }) => {
    await visitGlossary(page);
    await executeCreateGlossaryTermFlow(page);
  });

  test("updates an existing definition and makes PUT /api/glossary/:id", async ({
    page,
    mb,
  }) => {
    await executeUpdateGlossaryTermFlow(page, mb.api, () =>
      visitGlossary(page),
    );
  });

  test("deletes an existing definition and makes DELETE /api/glossary/:id", async ({
    page,
    mb,
  }) => {
    await executeDeleteGlossaryTermFlow(page, mb.api, () =>
      visitGlossary(page),
    );
  });
});

test.describe("data studio > glossary", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow(mb);
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  async function visitDataStudioGlossary(page: Page) {
    await visitDataStudio(page);
    await dataStudioNav(page).getByLabel("Glossary", { exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Glossary", exact: true }),
    ).toBeVisible();
  }

  test("should allow creating a new definition and trigger tracking event", async ({
    page,
    mb,
  }) => {
    await visitDataStudioGlossary(page);
    await executeCreateGlossaryTermFlow(page);
    await expectUnstructuredSnowplowEvent(mb, {
      event: "data_studio_glossary_term_created",
    });
  });

  test("should allow updating an existing definition and trigger tracking event", async ({
    page,
    mb,
  }) => {
    await executeUpdateGlossaryTermFlow(page, mb.api, () =>
      visitDataStudioGlossary(page),
    );
    await expectUnstructuredSnowplowEvent(mb, {
      event: "data_studio_glossary_term_updated",
    });
  });

  test("should allow deleting an existing definition and trigger tracking event", async ({
    page,
    mb,
  }) => {
    await executeDeleteGlossaryTermFlow(page, mb.api, () =>
      visitDataStudioGlossary(page),
    );
    await expectUnstructuredSnowplowEvent(mb, {
      event: "data_studio_glossary_term_deleted",
    });
  });
});
