/**
 * Playwright port of
 * e2e/test/scenarios/permissions/download-permissions.cy.spec.js
 *
 * Download-permission levels per group: full / limited (row cap) / none —
 * they control whether the export UI appears and the row limit on the
 * exported file. Gated on the EE `pro-self-hosted` token (the jar activates it).
 *
 * Notes:
 * - Permission levels are set through the graph API (updatePermissionsGraph)
 *   exactly as upstream; the first test drives the admin permissions UI.
 * - `modifyPermission` (full upstream signature) is reused read-only from
 *   support/admin-permissions.ts; `modal`/`popover`/`icon`/`visitQuestion`/
 *   `visitDashboard` from support/ui.ts; `downloadAndAssert` from
 *   support/downloads.ts. New helpers (sidebar, assertPermissionForItem,
 *   setDownloadPermissionsForProductsTable) live in support/download-permissions.ts.
 * - `cy.wait("@dataset")` after "Explore results" → a POST /api/dataset
 *   waitForResponse registered before the click (rule 2).
 * - `H.downloadAndAssert` lets the real browser download land as a file and
 *   parses it — strictly stronger than the Cypress intercept-and-redirect.
 */
import {
  assertPermissionForItem,
  DATA_ACCESS_PERMISSION_INDEX,
  DOWNLOAD_PERMISSION_INDEX,
  setDownloadPermissionsForProductsTable,
  sidebar,
} from "../support/download-permissions";
import { modifyPermission } from "../support/admin-permissions";
import { resolveToken } from "../support/api";
import { updatePermissionsGraph } from "../support/dashboard-repros";
import { downloadAndAssert } from "../support/downloads";
import { createNativeQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { icon, modal, popover, visitDashboard, visitQuestion } from "../support/ui";
import type { Page } from "@playwright/test";

const ALL_USERS_GROUP = 1;
const COLLECTION_GROUP = 5;
const DATA_GROUP = 6;

async function saveAndConfirmPermissions(page: Page) {
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  const dialog = modal(page);
  await expect(
    dialog.getByText("Save permissions?", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Are you sure you want to do this?", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(modal(page)).toHaveCount(0);
}

test.describe("scenarios > admin > permissions > data > downloads", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "EE download permissions require the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    // Restrict downloads for Collection and Data groups before each test so
    // that they don't override All Users.
    await updatePermissionsGraph(mb.api, {
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "none" },
        },
      },
      [DATA_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "none" },
        },
      },
    });
  });

  test("setting downloads permission UI flow should work", async ({ page }) => {
    // allows changing download results permission for a database
    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    await modifyPermission(page, "All Users", DOWNLOAD_PERMISSION_INDEX, "No");

    await saveAndConfirmPermissions(page);

    await assertPermissionForItem(
      page,
      "All Users",
      DOWNLOAD_PERMISSION_INDEX,
      "No",
    );

    // Make sure we can change download results permission for a table
    await sidebar(page)
      .getByText(/Orders/)
      .first()
      .click();

    await modifyPermission(
      page,
      "All Users",
      DOWNLOAD_PERMISSION_INDEX,
      "1 million rows",
    );

    await saveAndConfirmPermissions(page);

    await assertPermissionForItem(
      page,
      "All Users",
      DOWNLOAD_PERMISSION_INDEX,
      "1 million rows",
    );
  });

  test("respects 'no download' permissions when 'All users' group data permissions are set to `Blocked` (metabase#22408)", async ({
    page,
    mb,
  }) => {
    await page.goto(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    await modifyPermission(
      page,
      "All Users",
      DATA_ACCESS_PERMISSION_INDEX,
      "Blocked",
    );

    await saveAndConfirmPermissions(page);

    // When data permissions are set to `Blocked`, download permissions are
    // automatically revoked.
    await assertPermissionForItem(
      page,
      "All Users",
      DOWNLOAD_PERMISSION_INDEX,
      "No",
    );

    // Normal user belongs to both "data" and "collection" groups. They both
    // have restricted downloads so this user shouldn't have the right to
    // download anything.
    await mb.signInAsNormalUser();

    await visitQuestion(page, ORDERS_QUESTION_ID);

    await expect(page.getByText("Showing first 2,000 rows")).toBeVisible();
    await expect(icon(page, "download")).toHaveCount(0);
  });

  test("restricts users from downloading questions", async ({ page, mb }) => {
    // Restrict downloads for All Users
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "none" },
        },
      },
    });

    await mb.signInAsNormalUser();

    await visitQuestion(page, ORDERS_QUESTION_ID);

    await expect(page.getByText("Showing first 2,000 rows")).toBeVisible();
    await expect(icon(page, "download")).toHaveCount(0);

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    const dashcard = page.getByTestId("dashcard");
    await dashcard.getByTestId("legend-caption").hover();
    await dashcard.getByTestId("dashcard-menu").click();

    const menu = popover(page);
    await expect(menu.getByText("Edit question", { exact: true })).toBeVisible();
    await expect(
      menu.getByText("Download results", { exact: true }),
    ).toHaveCount(0);
  });

  test("limits users from downloading all results", async ({ page, mb }) => {
    // Restrict downloads for All Users
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "limited" },
        },
      },
    });

    await mb.signInAsNormalUser();
    await visitQuestion(page, ORDERS_QUESTION_ID);

    await downloadAndAssert(page, {
      fileType: "xlsx",
      questionId: ORDERS_QUESTION_ID,
    });
  });

  test.describe("native questions", () => {
    let nativeQuestionId: number;

    test.beforeEach(async ({ mb }) => {
      const card = await createNativeQuestion(mb.api, {
        name: "Native Orders",
        native: {
          query: "select * from orders",
        },
      });
      nativeQuestionId = card.id;
    });

    test("lets user download results from native queries", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();

      const id = nativeQuestionId;
      await visitQuestion(page, id);

      await downloadAndAssert(page, { fileType: "xlsx", questionId: id });

      // Make sure we can download results from an ad-hoc nested query based on
      // a native question.
      const datasetResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset",
      );
      await page.getByText("Explore results", { exact: true }).click();
      await datasetResponse;

      await downloadAndAssert(page, { fileType: "xlsx" });

      // Make sure we can download results from a native model.
      await mb.api.put(`/api/card/${id}`, { name: "Native Model" });

      await visitQuestion(page, id);

      await downloadAndAssert(page, { fileType: "xlsx", questionId: id });
    });

    test("prevents user from downloading a native question even if only one table doesn't have download permissions", async ({
      page,
      mb,
    }) => {
      await setDownloadPermissionsForProductsTable(mb.api, "none");

      await mb.signInAsNormalUser();

      const id = nativeQuestionId;
      await visitQuestion(page, id);

      await expect(page.getByText("Showing first 2,000 rows")).toBeVisible();
      await expect(icon(page, "download")).toHaveCount(0);

      // Ad-hoc nested query also shouldn't be downloadable
      const datasetResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset",
      );
      await page.getByText("Explore results", { exact: true }).click();
      await datasetResponse;

      await expect(page.getByText("Showing first 2,000 rows")).toBeVisible();
      await expect(icon(page, "download")).toHaveCount(0);

      // Convert question to a model, which also shouldn't be downloadable
      await mb.api.put(`/api/card/${id}`, { name: "Native Model" });

      await visitQuestion(page, id);

      await expect(page.getByText("Showing first 2,000 rows")).toBeVisible();
      await expect(icon(page, "download")).toHaveCount(0);
    });

    test("limits download results for a native question even if only one table has `limited` download permissions", async ({
      page,
      mb,
    }) => {
      await setDownloadPermissionsForProductsTable(mb.api, "limited");

      await mb.signInAsNormalUser();

      const id = nativeQuestionId;
      await visitQuestion(page, id);

      await downloadAndAssert(page, { fileType: "xlsx", questionId: id });

      // Ad-hoc nested query based on a native question should also have a
      // download row limit.
      const datasetResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset",
      );
      await page.getByText("Explore results", { exact: true }).click();
      await datasetResponse;

      await downloadAndAssert(page, { fileType: "xlsx" });

      // Convert question to a model, which should also have a download row
      // limit.
      await mb.api.put(`/api/card/${id}`, { name: "Native Model" });

      await visitQuestion(page, id);

      await downloadAndAssert(page, { fileType: "xlsx", questionId: id });
    });
  });
});
