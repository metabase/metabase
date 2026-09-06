/**
 * Playwright port of
 * e2e/test/scenarios/embedding/embed-resource-downloads.cy.spec.ts — the
 * `downloads` flag for STATIC ("guest") embeds, both dashboards and questions:
 * the `downloads=true/false` embed param controls whether the export UI (PDF /
 * "Download results") appears, and a real export runs from the embed.
 *
 * Porting notes:
 * - visitEmbeddedPage signs a JWT and navigates the top-level page, so every
 *   assertion is page-scoped (matching embedding-questions.spec.ts's EE
 *   describe). params live in the token; pageStyle.downloads goes in the hash.
 * - Downloads really complete here: page.waitForEvent("download") lands the file
 *   and we assert its suggestedFilename (cy.verifyDownload) — the last two tests
 *   additionally assert the GET embed-export response is a 200 with the right
 *   content type (downloadAndAssertEmbedQuestion), strictly stronger than the
 *   Cypress intercept-and-redirect.
 * - Gating: every upstream setup block calls H.activateToken("pro-self-hosted")
 *   (the `downloads` flag is an EE feature — without a token downloads can't be
 *   disabled). The whole file is skip-gated on resolveToken("pro-self-hosted");
 *   the jar activates it.
 * - Cypress `before()` (once) → `beforeEach` + restore, the established pattern
 *   (embedding-questions downloads describe) under per-worker backends.
 * - Two rendered timestamps are TIMEZONE-SENSITIVE ("February 11, 2028, 9:40
 *   PM"); CI sets TZ=US/Pacific and Playwright inherits it — run with
 *   TZ=US/Pacific locally to match.
 */
import { resolveToken } from "../support/api";
import { setSingleDate } from "../support/dashboard-filters-date";
import { assertTableData } from "../support/data-model";
import {
  addOrUpdateDashboardCard,
  visitEmbeddedPage,
} from "../support/embedding-dashboard";
import {
  deleteDownloadsFolder,
  downloadAndAssertEmbedQuestion,
  downloadEmbedQuestion,
  getEmbeddedDashboardCardMenu,
  waitLoading,
} from "../support/embed-resource-downloads";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { exportFromDashcard } from "../support/downloads";
import {
  createDashboardWithQuestions,
  createNativeQuestion,
} from "../support/factories";
import { test, expect } from "../support/fixtures";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { getDashboardCard } from "../support/dashboard";
import { main, popover } from "../support/ui";

const { PRODUCTS, PRODUCTS_ID, PEOPLE } = SAMPLE_DATABASE as {
  PRODUCTS: Record<string, number>;
  PRODUCTS_ID: number;
  PEOPLE: Record<string, number>;
};

/**
 * These tests are about the `downloads` flag for static embeds, both dashboards
 * and questions. Unless the product changes, these should test the same things
 * as public-resource-downloads.cy.spec.ts.
 */
test.describe("Static embed dashboards/questions downloads (results and export as pdf)", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await resetSnowplow(mb);
    await deleteDownloadsFolder();
  });

  test.describe("Static embed dashboards", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
        enable_embedding: true,
      });

      await mb.api.activateToken("pro-self-hosted");
    });

    test.afterEach(async ({ mb }) => {
      await expectNoBadSnowplowEvents(mb);
    });

    test("#downloads=false should disable both PDF downloads and dashcard results downloads", async ({
      page,
      mb,
    }) => {
      await visitEmbeddedPage(
        page,
        mb,
        {
          resource: { dashboard: ORDERS_DASHBOARD_ID },
          params: {},
        },
        {
          pageStyle: {
            downloads: false,
          },
        },
      );
      await waitLoading(page);

      await expect(
        page.getByRole("button", { name: "Download as PDF", exact: true }),
      ).toHaveCount(0);

      // we should not have any dashcard action in a static embedded/embed
      // scenario, so the menu should not be there
      await expect(
        page.getByRole("button", { name: "Download results", exact: true }),
      ).toHaveCount(0);
    });

    test("should be able to download a static embedded dashboard as PDF", async ({
      page,
      mb,
    }) => {
      await visitEmbeddedPage(
        page,
        mb,
        {
          resource: { dashboard: ORDERS_DASHBOARD_ID },
          params: {},
        },
        {
          pageStyle: {
            downloads: true,
          },
        },
      );
      await waitLoading(page);

      const downloadEvent = page.waitForEvent("download");
      await page
        .locator("header")
        .getByRole("button", { name: "Download as PDF", exact: true })
        .click();
      const download = await downloadEvent;

      expect(download.suggestedFilename()).toBe("Orders in a dashboard.pdf");

      await expectUnstructuredSnowplowEvent(mb, {
        event: "dashboard_pdf_exported",
        dashboard_id: 0,
        dashboard_accessed_via: "static-embed",
      });
    });

    test("should be able to download a static embedded dashcard as CSV", async ({
      page,
      mb,
    }) => {
      await visitEmbeddedPage(
        page,
        mb,
        {
          resource: { dashboard: ORDERS_DASHBOARD_ID },
          params: {},
        },
        {
          pageStyle: {
            downloads: true,
          },
        },
      );

      await waitLoading(page);

      await getDashboardCard(page).hover();
      await getEmbeddedDashboardCardMenu(page).click();
      const download = await exportFromDashcard(page, ".csv");
      expect(download.suggestedFilename()).toContain(".csv");

      await expectUnstructuredSnowplowEvent(mb, {
        event: "download_results_clicked",
        resource_type: "dashcard",
        accessed_via: "static-embed",
        export_type: "csv",
      });
    });

    test.describe("with dashboard parameters", () => {
      let dashboardId: number;

      test.beforeEach(async ({ mb }) => {
        await mb.signInAsAdmin();

        await mb.api.activateToken("pro-self-hosted");

        // Test parameter with accentuation (metabase#49118)
        const CATEGORY_FILTER = {
          id: "5aefc725",
          name: "usuário",
          slug: "usu%C3%A1rio",
          type: "string/=",
        };
        const questionDetails = {
          name: "Products",
          query: {
            "source-table": PRODUCTS_ID,
          },
        };
        const { dashboard, questions } = await createDashboardWithQuestions(
          mb.api,
          {
            dashboardDetails: {
              name: "Dashboard with a parameter",
              parameters: [CATEGORY_FILTER],
              enable_embedding: true,
              embedding_params: {
                [CATEGORY_FILTER.slug]: "enabled",
              },
            },
            questions: [questionDetails],
          },
        );
        dashboardId = dashboard.id;
        const questionId = questions[0].id;
        await addOrUpdateDashboardCard(mb.api, {
          dashboard_id: dashboardId,
          card_id: questionId,
          card: {
            parameter_mappings: [
              {
                card_id: questionId,
                parameter_id: CATEGORY_FILTER.id,
                target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
              },
            ],
          },
        });
      });

      test("should be able to download a static embedded dashcard as CSV", async ({
        page,
        mb,
      }) => {
        await visitEmbeddedPage(
          page,
          mb,
          {
            resource: { dashboard: dashboardId },
            params: {},
          },
          {
            pageStyle: {
              downloads: true,
            },
          },
        );

        await waitLoading(page);

        await getDashboardCard(page).hover();
        await getEmbeddedDashboardCardMenu(page).click();
        const download = await exportFromDashcard(page, ".csv");
        expect(download.suggestedFilename()).toContain(".csv");

        await expectUnstructuredSnowplowEvent(mb, {
          event: "download_results_clicked",
          resource_type: "dashcard",
          accessed_via: "static-embed",
          export_type: "csv",
        });
      });
    });
  });

  test.describe("Static embed questions", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      await mb.api.put(`/api/card/${ORDERS_BY_YEAR_QUESTION_ID}`, {
        enable_embedding: true,
      });

      await mb.api.activateToken("pro-self-hosted");
    });

    test("#downloads=false should disable result downloads", async ({
      page,
      mb,
    }) => {
      await visitEmbeddedPage(
        page,
        mb,
        {
          resource: { question: ORDERS_BY_YEAR_QUESTION_ID },
          params: {},
        },
        {
          pageStyle: {
            downloads: false,
          },
        },
      );

      await waitLoading(page);

      await expect(
        page.getByRole("button", { name: "Download results", exact: true }),
      ).toHaveCount(0);
    });

    test("should be able to download the question as PNG", async ({
      page,
      mb,
    }) => {
      await visitEmbeddedPage(
        page,
        mb,
        {
          resource: { question: ORDERS_BY_YEAR_QUESTION_ID },
          params: {},
        },
        {
          pageStyle: {
            downloads: true,
          },
        },
      );

      await waitLoading(page);

      const download = await downloadEmbedQuestion(page, ".png");
      expect(download.suggestedFilename()).toContain(".png");

      await expectUnstructuredSnowplowEvent(mb, {
        event: "download_results_clicked",
        resource_type: "question",
        accessed_via: "static-embed",
        export_type: "png",
      });
    });

    test("should be able to download a static embedded card as CSV", async ({
      page,
      mb,
    }) => {
      await visitEmbeddedPage(
        page,
        mb,
        {
          resource: { question: ORDERS_BY_YEAR_QUESTION_ID },
          params: {},
        },
        {
          pageStyle: {
            downloads: true,
          },
        },
      );

      await waitLoading(page);

      const download = await downloadEmbedQuestion(page, ".csv");
      expect(download.suggestedFilename()).toContain(".csv");

      await expectUnstructuredSnowplowEvent(mb, {
        event: "download_results_clicked",
        resource_type: "question",
        accessed_via: "static-embed",
        export_type: "csv",
      });
    });

    test.describe("with native question parameters", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.signInAsAdmin();

        await mb.api.activateToken("pro-self-hosted");
      });

      test("should be able to download a static embedded question as CSV with correct parameters when field filters has multiple values (metabase#52430)", async ({
        page,
        mb,
      }) => {
        const FILTER_VALUES = ["NY", "CA"];
        const QUESTION_NAME = "Native question with a Field parameter";

        const card = await createNativeQuestion(mb.api, {
          name: QUESTION_NAME,
          native: {
            "template-tags": {
              state: {
                id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
                name: "state",
                "display-name": "State",
                type: "dimension",
                options: {
                  "case-sensitive": false,
                },
                dimension: ["field", PEOPLE.STATE, null],
                default: null,
                "widget-type": "string/contains",
              },
            },
            query:
              "select id, email, state from people where {{state}} limit 2",
          },
          parameters: [
            {
              id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
              type: "string/contains",
              options: {
                "case-sensitive": false,
              },
              target: ["dimension", ["template-tag", "state"]],
              name: "State",
              slug: "state",
              default: null,
            },
          ],
          enable_embedding: true,
          embedding_params: {
            state: "enabled",
          },
        });

        await visitEmbeddedPage(
          page,
          mb,
          {
            resource: { question: card.id },
            params: {
              state: FILTER_VALUES,
            },
          },
          {
            pageStyle: {
              downloads: true,
            },
            // should ignore `?locale=xx` search parameter when downloading
            // results from questions without parameters (metabase#53037)
            qs: {
              locale: "en",
            },
          },
        );

        await waitLoading(page);

        const FIRST_ROW = ["5", "leffler.dominique@hotmail.com", FILTER_VALUES[0]];
        const SECOND_ROW = ["13", "mustafa.thiel@hotmail.com", FILTER_VALUES[1]];

        await assertTableData(main(page), {
          columns: ["ID", "EMAIL", "STATE"],
          firstRows: [FIRST_ROW, SECOND_ROW],
        });

        await page
          .getByRole("heading", { name: QUESTION_NAME, exact: true })
          .hover();
        await downloadAndAssertEmbedQuestion(page, {
          enableFormatting: true,
          fileType: "csv",
        });

        await expectUnstructuredSnowplowEvent(mb, {
          event: "download_results_clicked",
          resource_type: "question",
          accessed_via: "static-embed",
          export_type: "csv",
        });
      });

      test("should be able to download a static embedded question as CSV when a filter expects 1 parameter value e.g. date (metabase#58957, 59074)", async ({
        page,
        mb,
      }) => {
        const FILTER_VALUE = "2028-02-11";
        const QUESTION_NAME = "Native question with a Date parameter";

        const card = await createNativeQuestion(mb.api, {
          name: QUESTION_NAME,
          native: {
            "template-tags": {
              created_at: {
                id: "c9bbcc68-c59b-4ac1-b5e7-50d2123b4150",
                name: "created_at",
                "display-name": "Created At",
                type: "date",
              },
            },
            query:
              "select id, created_at, quantity from orders where created_at >= {{created_at}} limit 1",
          },
          parameters: [
            {
              id: "c9bbcc68-c59b-4ac1-b5e7-50d2123b4150",
              type: "date/single",
              options: {
                "case-sensitive": false,
              },
              target: ["variable", ["template-tag", "created_at"]],
              name: "Created At",
              slug: "created_at",
            },
          ],
          enable_embedding: true,
          embedding_params: {
            created_at: "enabled",
          },
        });

        await visitEmbeddedPage(
          page,
          mb,
          {
            resource: { question: card.id },
            params: {},
          },
          {
            pageStyle: {
              downloads: true,
            },
            // should ignore `?locale=xx` search parameter when downloading
            // results from questions with visible parameters (metabase#53037)
            qs: {
              locale: "en",
            },
          },
        );

        await page
          .getByRole("button", { name: "Created At", exact: true })
          .click();
        await setSingleDate(page, FILTER_VALUE);
        await popover(page).getByText("Add filter", { exact: true }).click();

        await waitLoading(page);

        const FIRST_ROW = ["1", "February 11, 2028, 9:40 PM", "2"];

        await assertTableData(main(page), {
          columns: ["ID", "CREATED_AT", "QUANTITY"],
          firstRows: [FIRST_ROW],
        });

        await page
          .getByRole("heading", { name: QUESTION_NAME, exact: true })
          .hover();
        await downloadAndAssertEmbedQuestion(page, {
          enableFormatting: true,
          fileType: "csv",
        });
      });
    });
  });
});
