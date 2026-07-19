/**
 * Playwright port of
 * e2e/test/scenarios/sharing/public-resource-downloads.cy.spec.ts — the
 * `downloads` flag for PUBLIC-link dashboards and questions: the
 * `#downloads=true/false/pdf/results` hash on a public link controls which
 * export UI (PDF / "Download results") appears, and a real csv/png export runs
 * from the public page. The mirror of embed-resource-downloads.spec.ts (static
 * embeds) — "unless the product changes, these should test the same things".
 *
 * Porting notes:
 * - The public link is minted via the API (createPublicLink) and the URL is
 *   built from mb.baseUrl (`restore()` re-points site-url to the worker origin),
 *   instead of driving the sharing menu and reading the input value — faithful
 *   and simpler, matching public-sharing.spec.ts. The hash is appended per test.
 * - Cypress `before()` (once) → `beforeEach` + restore, the per-worker-backend
 *   pattern (embed-resource-downloads.spec.ts). cy.signOut → mb.signOut so the
 *   public page is reached without a session, as upstream intends.
 * - Downloads really complete: the FE fetches the export as a blob, so
 *   download.url() is a blob URL — we assert the export *response* (200 + content
 *   type) via waitForResponse, strictly stronger than the Cypress
 *   intercept-and-redirect. Public dashcard = POST /api/public/dashboard/..., the
 *   public question = GET /public/question/<uuid>.<type> (downloads.ts).
 * - Snowplow (resetSnowplow / expectNoBadSnowplowEvents /
 *   expectUnstructuredSnowplowEvent) → no-op stubs (PORTING rule 6); kept called
 *   so the structure mirrors upstream.
 * - Gating: every upstream setup calls H.activateToken("pro-self-hosted") (the
 *   `downloads` flag is EE — without a token downloads can't be disabled). The
 *   whole file is skip-gated on resolveToken("pro-self-hosted"); the jar
 *   activates it.
 * - findByRole/findByLabelText string args are exact (rule 1).
 */
import { resolveToken } from "../support/api";
import {
  deleteDownloadsFolder,
  downloadEmbedQuestion,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  getEmbeddedDashboardCardMenu,
  resetSnowplow,
  waitLoading,
} from "../support/embed-resource-downloads";
import { createNativeQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { createPublicLink } from "../support/public-sharing";
import {
  downloadPublicDashcardCsv,
  downloadPublicQuestionCsv,
} from "../support/public-resource-downloads";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "../support/sample-data";
import { ORDERS_DASHBOARD_DASHCARD_ID } from "../support/dashboard-core";
import { main } from "../support/ui";

/**
 * These tests are about the `downloads` flag for public dashboards and
 * questions. Unless the product changes, these should test the same things as
 * embed-resource-downloads.spec.ts.
 */
test.describe("Public dashboards/questions downloads (results and pdf)", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async () => {
    await resetSnowplow();
    await deleteDownloadsFolder();
  });

  test.describe("Public dashboards", () => {
    let publicLink: string;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      const uuid = await createPublicLink(
        mb.api,
        "dashboard",
        ORDERS_DASHBOARD_ID,
      );
      publicLink = `${mb.baseUrl}/public/dashboard/${uuid}`;

      await mb.signOut();
    });

    test.afterEach(async () => {
      await expectNoBadSnowplowEvents();
    });

    test("#downloads=false should disable both PDF downloads and dashcard results downloads", async ({
      page,
    }) => {
      await page.goto(`${publicLink}#downloads=false`);
      await waitLoading(page);

      await expect(
        page.getByRole("button", { name: "Download as PDF", exact: true }),
      ).toHaveCount(0);

      // we should not have any dashcard action in a public/embed scenario, so
      // the menu should not be there
      await expect(getEmbeddedDashboardCardMenu(page)).toHaveCount(0);
    });

    test("#downloads=pdf should enable only PDF downloads", async ({ page }) => {
      await page.goto(`${publicLink}#downloads=pdf`);
      await waitLoading(page);

      await expect(
        page
          .locator("header")
          .getByRole("button", { name: "Download as PDF", exact: true }),
      ).toBeVisible();
      await expect(getEmbeddedDashboardCardMenu(page)).toHaveCount(0);
    });

    test("#downloads=results should enable only dashcard results downloads", async ({
      page,
    }) => {
      await page.goto(`${publicLink}#downloads=results`);
      await waitLoading(page);

      await expect(
        page.getByRole("button", { name: "Download as PDF", exact: true }),
      ).toHaveCount(0);

      await main(page).hover();
      await getEmbeddedDashboardCardMenu(page).click();
      await expect(
        page.getByLabel("Download results", { exact: true }),
      ).toBeVisible();
    });

    test("#downloads=pdf,results should enable both PDF and results downloads", async ({
      page,
    }) => {
      await page.goto(`${publicLink}#downloads=pdf,results`);
      await waitLoading(page);

      await expect(
        page
          .locator("header")
          .getByRole("button", { name: "Download as PDF", exact: true }),
      ).toBeVisible();

      await main(page).hover();
      await expect(getEmbeddedDashboardCardMenu(page)).toBeVisible();
      await getEmbeddedDashboardCardMenu(page).click();
      await expect(
        page.getByLabel("Download results", { exact: true }),
      ).toBeVisible();
    });

    test("#downloads=results,pdf should enable both PDF and results downloads (order agnostic)", async ({
      page,
    }) => {
      await page.goto(`${publicLink}#downloads=results,pdf`);
      await waitLoading(page);

      await expect(
        page
          .locator("header")
          .getByRole("button", { name: "Download as PDF", exact: true }),
      ).toBeVisible();

      await main(page).hover();
      await getEmbeddedDashboardCardMenu(page).click();
      await expect(
        page.getByLabel("Download results", { exact: true }),
      ).toBeVisible();
    });

    test("#downloads=results, pdf should handle whitespace between parameters", async ({
      page,
    }) => {
      await page.goto(`${publicLink}#downloads=results, pdf`);
      await waitLoading(page);

      await expect(
        page
          .locator("header")
          .getByRole("button", { name: "Download as PDF", exact: true }),
      ).toBeVisible();

      await main(page).hover();
      await getEmbeddedDashboardCardMenu(page).click();
      await expect(
        page.getByLabel("Download results", { exact: true }),
      ).toBeVisible();
    });

    test("should be able to download a public dashboard as PDF", async ({
      page,
    }) => {
      await page.goto(`${publicLink}#downloads=true`);
      await waitLoading(page);

      const downloadEvent = page.waitForEvent("download");
      await page
        .locator("header")
        .getByRole("button", { name: "Download as PDF", exact: true })
        .click();
      const download = await downloadEvent;

      expect(download.suggestedFilename()).toBe("Orders in a dashboard.pdf");

      await expectUnstructuredSnowplowEvent({
        event: "dashboard_pdf_exported",
        dashboard_id: 0,
        dashboard_accessed_via: "public-link",
      });
    });

    test("should be able to download a public dashcard as CSV", async ({
      page,
    }) => {
      await page.goto(publicLink);
      await waitLoading(page);

      const uuid = publicLink.split("/").at(-1) as string;

      await downloadPublicDashcardCsv(page, {
        uuid,
        dashcardId: ORDERS_DASHBOARD_DASHCARD_ID,
      });

      await expectUnstructuredSnowplowEvent({
        event: "download_results_clicked",
        resource_type: "dashcard",
        accessed_via: "public-link",
        export_type: "csv",
      });
    });
  });

  test.describe("Public questions", () => {
    let publicLink: string;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      const uuid = await createPublicLink(
        mb.api,
        "card",
        ORDERS_BY_YEAR_QUESTION_ID,
      );
      publicLink = `${mb.baseUrl}/public/question/${uuid}`;

      await mb.signOut();
    });

    test("#downloads=results should enable result downloads", async ({
      page,
    }) => {
      await page.goto(`${publicLink}#downloads=results`);
      await waitLoading(page);

      await main(page).hover();
      await expect(
        page.getByRole("button", { name: "Download results", exact: true }),
      ).toBeVisible();
    });

    test("#downloads=false should disable result downloads", async ({
      page,
    }) => {
      await page.goto(`${publicLink}#downloads=false`);
      await waitLoading(page);

      await main(page).hover();
      await expect(
        page.getByRole("button", { name: "Download results", exact: true }),
      ).toHaveCount(0);
    });

    test("should be able to download the question as PNG", async ({ page }) => {
      await page.goto(publicLink);
      await waitLoading(page);

      const download = await downloadEmbedQuestion(page, ".png");
      expect(download.suggestedFilename()).toContain(".png");

      await expectUnstructuredSnowplowEvent({
        event: "download_results_clicked",
        resource_type: "question",
        accessed_via: "public-link",
        export_type: "png",
      });
    });

    test("should be able to download a public card as CSV", async ({ page }) => {
      await page.goto(publicLink);
      await waitLoading(page);

      const uuid = publicLink.split("/").at(-1) as string;

      await downloadPublicQuestionCsv(page, { uuid });

      await expectUnstructuredSnowplowEvent({
        event: "download_results_clicked",
        resource_type: "question",
        accessed_via: "public-link",
        export_type: "csv",
      });
    });
  });

  test.describe("Public questions with parameters", () => {
    let publicLink: string;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      const card = await createNativeQuestion(mb.api, {
        native: {
          query: "SELECT * FROM orders WHERE TOTAL > {{ minimum }}",
          "template-tags": {
            minimum: {
              id: "930e4001",
              name: "minimum",
              "display-name": "Minimum",
              type: "number",
              default: "10",
            },
          },
        },
        parameters: [
          {
            id: "930e4001",
            slug: "minimum",
            name: "minimum",
            type: "number",
            default: 10,
            target: ["variable", ["template-tag", "minimum"]],
          },
        ],
      });

      const uuid = await createPublicLink(mb.api, "card", card.id);
      publicLink = `${mb.baseUrl}/public/question/${uuid}`;

      await mb.signOut();
    });

    test("should not pass all the parameters to the public link", async ({
      page,
    }) => {
      await page.goto(publicLink);
      await waitLoading(page);

      await main(page).hover();
      await expect(
        page.getByLabel("Download results", { exact: true }),
      ).toBeVisible();

      const uuid = publicLink.split("/").at(-1) as string;

      const { request } = await downloadPublicQuestionCsv(page, { uuid });

      const url = new URL(request.url());
      const parameters = JSON.parse(url.searchParams.get("parameters") ?? "[]");

      expect(parameters).toHaveLength(1);
      expect(parameters[0]).toHaveProperty("id");
      expect(parameters[0]).toHaveProperty("value");
      expect(parameters[0]).not.toHaveProperty("type");
      expect(parameters[0]).not.toHaveProperty("target");
    });
  });
});
