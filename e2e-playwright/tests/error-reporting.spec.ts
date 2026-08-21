/**
 * Playwright port of e2e/test/scenarios/admin-2/error-reporting.cy.spec.ts
 *
 * Porting notes:
 * - cy.deleteDownloadsFolder / cy.verifyDownload / findFiles tasks are
 *   unnecessary: every Playwright download lands in its own temp file, so
 *   there is no shared downloads folder to clean or scan.
 * - The duplicate in-test H.restore() calls (tests 1-3 restored on top of the
 *   beforeEach restore) are dropped.
 * - realPress(["Control", "F1"]) → pressDownloadDiagnosticsShortcut, which
 *   resolves tinykeys' "$mod" per platform (Meta on macOS, Control on Linux);
 *   the hardcoded Control only worked because Cypress CI runs on Linux.
 * - The embedding test's "modal never appears" check gets an explicit grace
 *   wait — a bare toHaveCount(0) right after the keypress would pass
 *   vacuously before the modal had a chance to open.
 */
import type { FrameLocator, Page } from "@playwright/test";

import {
  downloadDiagnosticInfo,
  pressDownloadDiagnosticsShortcut,
} from "../support/admin-extras";
import {
  commandPalette,
  commandPaletteButton,
  commandPaletteInput,
} from "../support/command-palette";
import { modal } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import { tableInteractive } from "../support/models";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import { visitFullAppEmbeddingUrl } from "../support/search";
import { visitDashboard, visitQuestion } from "../support/ui";

test.describe("error reporting modal", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test('should show an error reporting modal when pressing "Ctrl + F1" on the home page', async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    await page.goto("/");

    await page
      .getByTestId("home-page")
      .getByText(/see what metabase can do/i)
      .click();
    // The Cypress spec waited 500ms between focusing the page and pressing
    // the shortcut; keep it — the kbar listener attaches asynchronously.
    await page.waitForTimeout(500);

    await pressDownloadDiagnosticsShortcut(page);

    await expect(
      modal(page).getByText("Gather diagnostic information", { exact: true }),
    ).toBeVisible();
    const fileContent = await downloadDiagnosticInfo(page);

    expect(fileContent.entityName).toBeUndefined();
    expect(fileContent).toHaveProperty("frontendErrors");
    expect(fileContent).toHaveProperty("backendErrors");
    expect(fileContent).toHaveProperty("userLogs");
    expect(fileContent).toHaveProperty("logs");
    expect(fileContent).toHaveProperty("bugReportDetails");
  });

  test("should allow you to open the error reporting modal via the command palette", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    await page.goto("/");

    await expect(
      page.getByTestId("home-page").getByText(/see what metabase can do/i),
    ).toBeVisible();

    await commandPaletteButton(page).click();
    await commandPaletteInput(page).pressSequentially("Error");
    await commandPalette(page)
      .getByRole("option", { name: /Download diagnostics/ })
      .click();

    await expect(
      page.getByRole("dialog", {
        name: "Gather diagnostic information",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should not show error reporting modal in embedding", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    const frame = await visitFullAppEmbeddingUrl(page, {
      url: "/",
      qs: { top_nav: true },
      baseUrl: mb.baseUrl,
    });

    await frame
      .getByTestId("home-page")
      .getByText(/see what metabase can do/i)
      .click();

    await pressDownloadDiagnosticsShortcut(page);

    // Grace period: give a (wrongly) opening modal time to appear before
    // asserting its absence.
    await page.waitForTimeout(1000);
    await expect(embeddedModal(frame)).toHaveCount(0);
  });

  test("should include question-specific data when triggered on the question page", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    const { id: questionId } = await mb.api.createQuestion({
      name: "Diagnostic Question 1",
      query: { "source-table": 1, limit: 10 },
    });
    await visitQuestion(page, questionId);

    await tableInteractive(page).click();
    await pressDownloadDiagnosticsShortcut(page);

    let dialog = modal(page);
    await expect(
      dialog.getByText("Gather diagnostic information", { exact: true }),
    ).toBeVisible();
    await expect(queryResultsCheckbox(page)).not.toBeChecked();
    const withoutQueryResults = await downloadDiagnosticInfo(page);

    expect(withoutQueryResults.entityName).toBe("question");
    expect(withoutQueryResults).toHaveProperty("frontendErrors");
    expect(withoutQueryResults).toHaveProperty("backendErrors");
    expect(withoutQueryResults).toHaveProperty("userLogs");
    expect(withoutQueryResults).toHaveProperty("logs");
    expect(withoutQueryResults).toHaveProperty("bugReportDetails");
    expect(withoutQueryResults).toHaveProperty("entityInfo");
    expect(withoutQueryResults).not.toHaveProperty("queryResults");

    await pressDownloadDiagnosticsShortcut(page);

    dialog = modal(page);
    await expect(
      dialog.getByText("Gather diagnostic information", { exact: true }),
    ).toBeVisible();
    await expect(queryResultsCheckbox(page)).not.toBeChecked();
    await queryResultsCheckbox(page).click({ force: true }); // off by default
    await expect(queryResultsCheckbox(page)).toBeChecked();
    const withQueryResults = await downloadDiagnosticInfo(page);

    expect(withQueryResults.entityName).toBe("question");
    expect(withQueryResults).toHaveProperty("frontendErrors");
    expect(withQueryResults).toHaveProperty("backendErrors");
    expect(withQueryResults).toHaveProperty("userLogs");
    expect(withQueryResults).toHaveProperty("logs");
    expect(withQueryResults).toHaveProperty("bugReportDetails");
    expect(withQueryResults).toHaveProperty("entityInfo");
    expect(withQueryResults).toHaveProperty("queryResults");
  });

  test("can include query data on question pages", async ({ page, mb }) => {
    await mb.signInAsAdmin();
    const { id: questionId } = await mb.api.createQuestion({
      name: "Diagnostic Question 1",
      query: { "source-table": 1, limit: 10 },
    });
    await visitQuestion(page, questionId);

    await tableInteractive(page).click();
    await pressDownloadDiagnosticsShortcut(page);

    await expect(
      modal(page).getByText("Gather diagnostic information", { exact: true }),
    ).toBeVisible();
    await expect(queryResultsCheckbox(page)).not.toBeChecked();
    await queryResultsCheckbox(page).click({ force: true }); // off by default
    await expect(queryResultsCheckbox(page)).toBeChecked();
    const fileContent = await downloadDiagnosticInfo(page);

    expect(fileContent.entityName).toBe("question");
    expect(fileContent).toHaveProperty("frontendErrors");
    expect(fileContent).toHaveProperty("backendErrors");
    expect(fileContent).toHaveProperty("userLogs");
    expect(fileContent).toHaveProperty("logs");
    expect(fileContent).toHaveProperty("bugReportDetails");
    expect(fileContent).toHaveProperty("entityInfo");
    expect(fileContent).toHaveProperty("queryResults");
  });

  test("should include the hydrated dashboard definition for a dashboard", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await page.getByTestId("dashboard-grid").click();

    await pressDownloadDiagnosticsShortcut(page);

    const dialog = modal(page);
    await expect(
      dialog.getByText("Gather diagnostic information", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel("Dashboard definition", { exact: true }),
    ).toBeChecked();
    const fileContent = await downloadDiagnosticInfo(page);

    expect(fileContent.entityName).toBe("dashboard");
    expect(fileContent.entityInfo).not.toBeNull();
    expect(fileContent.entityInfo?.id).toBe(ORDERS_DASHBOARD_ID);
    expect(Array.isArray(fileContent.entityInfo?.dashcards)).toBe(true);
    expect(fileContent.entityInfo?.dashcards?.length).toBeGreaterThan(0);
  });

  test("should not include backend logs for non-admin users", async ({
    page,
    mb,
  }) => {
    await mb.signInAsNormalUser();
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await page.getByTestId("dashboard-grid").click();

    await pressDownloadDiagnosticsShortcut(page);

    const dialog = modal(page);
    await expect(
      dialog.getByText("Gather diagnostic information", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel("Dashboard definition", { exact: true }),
    ).toBeVisible();
    await expect(queryResultsCheckbox(page)).toHaveCount(0);
    await expect(dialog.getByLabel(/server logs/i)).toHaveCount(0);
    const fileContent = await downloadDiagnosticInfo(page);

    expect(fileContent.entityName).toBe("dashboard");
    expect(fileContent.url).toContain("/dashboard/");

    expect(fileContent).toHaveProperty("frontendErrors");
    expect(fileContent).toHaveProperty("bugReportDetails");
    expect(fileContent).toHaveProperty("entityInfo");
    expect(fileContent).not.toHaveProperty("logs");
    expect(fileContent).not.toHaveProperty("userLogs");
    expect(fileContent).not.toHaveProperty("backendErrors");
  });
});

function queryResultsCheckbox(page: Page) {
  return modal(page).getByLabel("Query results", { exact: true });
}

/** modal() takes a Page; the embedding test needs it inside the iframe. */
function embeddedModal(frame: FrameLocator) {
  return frame.locator("[role='dialog'][aria-modal='true']");
}
