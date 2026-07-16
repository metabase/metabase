/**
 * Playwright port of e2e/test/scenarios/permissions/permissions-baseline.cy.spec.js
 */
import type { Page } from "@playwright/test";

import { test, expect } from "../support/fixtures";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  icon,
  signInWithCachedSession,
  visitQuestionAdhoc,
} from "../support/permissions";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { visitQuestion } from "../support/ui";

test.describe("scenarios > permissions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  const PATHS = [
    `/dashboard/${ORDERS_DASHBOARD_ID}`,
    `/question/${ORDERS_QUESTION_ID}`,
    `/collection/${ADMIN_PERSONAL_COLLECTION_ID}`,
    "/admin",
  ];

  for (const path of PATHS) {
    test(`should display the permissions screen on ${path}`, async ({
      page,
      context,
    }) => {
      await signInWithCachedSession(context, "none");
      await page.goto(path);
      await checkUnauthorized(page);
    });
  }

  test("should not allow to run adhoc native questions without permissions", async ({
    page,
    context,
  }) => {
    await signInWithCachedSession(context, "none");

    await visitQuestionAdhoc(
      page,
      {
        display: "scalar",
        dataset_query: {
          type: "native",
          native: {
            query: "SELECT 1",
          },
          database: SAMPLE_DB_ID,
        },
      },
      { autorun: false },
    );

    // Cypress's .should("be.disabled") only checks the first match (jQuery
    // .prop semantics); a second, hidden run button exists and is enabled.
    // The test's intent is that the visible run button is disabled.
    await expect(
      page.getByLabel("Refresh", { exact: true }).filter({ visible: true }),
    ).toBeDisabled();
  });

  test("should let a user with no data permissions view questions", async ({
    page,
    mb,
  }) => {
    await mb.signIn("nodata");
    await visitQuestion(page, ORDERS_QUESTION_ID);
    // check that the data loads
    await expect(
      page.getByText(/February 11, 2028, 9:40 PM/).first(),
    ).toBeVisible();
  });
});

const checkUnauthorized = async (page: Page) => {
  await expect(icon(page, "key")).toBeVisible();
  await expect(
    page.getByText("Sorry, you don’t have permission to see that.", {
      exact: true,
    }),
  ).toBeVisible();
};
