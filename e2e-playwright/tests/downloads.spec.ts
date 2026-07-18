/**
 * Playwright port of e2e/test/scenarios/sharing/downloads/downloads.cy.spec.js
 *
 * Differences from the Cypress original:
 * - Downloads really complete here: downloadAndAssert (support/downloads.ts)
 *   waits for the browser download and parses the file, instead of
 *   intercepting the export request and redirecting it away.
 * - Snowplow helpers are no-op stubs (see TODO below) — the spike harness has
 *   no snowplow-micro container.
 * - cy.deleteDownloadsFolder/cy.verifyDownload have no equivalent: Playwright
 *   saves each download to a unique temp path, so filename assertions run on
 *   the Download object directly.
 */
import type { Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import type { MetabaseApi } from "../support/api";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  setFilter,
} from "../support/dashboard";
import {
  getDashboardCardMenu,
  showDashboardCardActions,
} from "../support/dashboard-cards";
import {
  downloadAndAssert,
  ensureDownloadStatusDismissed,
  exportFromDashcard,
} from "../support/downloads";
import type { ExportFileType } from "../support/downloads";
import { test, expect } from "../support/fixtures";
import { startNewQuestion } from "../support/notebook";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { openSharingMenu } from "../support/sharing";
import { popover, visitDashboard, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ORDERS_DASHBOARD_DASHCARD_ID = (() => {
  const dashboard = SAMPLE_INSTANCE_DATA.dashboards.find(
    ({ name }) => name === "Orders in a dashboard",
  );
  if (!dashboard) {
    throw new Error(
      'Dashboard "Orders in a dashboard" not found in cypress_sample_instance_data',
    );
  }
  return dashboard.dashcards[0].id;
})();

const testCases: ExportFileType[] = ["csv", "xlsx"];

const canSavePngQuestion = {
  name: "Q1",
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.metrics": ["count"],
    "graph.dimensions": ["CREATED_AT"],
  },
};

const cannotSavePngQuestion = {
  name: "Q2",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
  },
  visualization_settings: {},
};

test.describe("scenarios > question > download", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("[snowplow]", () => {
    test.beforeEach(async () => {
      await resetSnowplow();
      await enableTracking();
    });

    test.afterEach(async () => {
      await expectNoBadSnowplowEvents();
    });

    for (const fileType of testCases) {
      test(`downloads ${fileType} file`, async ({ page }) => {
        await startNewQuestion(page);
        const picker = miniPicker(page);
        await picker.getByText("Our analytics", { exact: true }).click();
        await picker.getByText("Orders, Count", { exact: true }).click();

        await visualize(page);
        await expect(page.getByText("18,760").first()).toBeVisible();

        await downloadAndAssert(page, { fileType });

        await expectUnstructuredSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "ad-hoc-question",
          accessed_via: "internal",
          export_type: fileType,
        });
      });
    }
  });

  for (const fileType of testCases) {
    test(`should allow downloading unformatted ${fileType} data`, async ({
      page,
      mb,
    }) => {
      const fieldRef = ["field", ORDERS.TOTAL, null];
      const columnKey = `["ref",${JSON.stringify(fieldRef)}]`;

      const { id: questionId } = await createQuestion(mb.api, {
        query: {
          "source-table": ORDERS_ID,
          fields: [fieldRef],
        },
        visualization_settings: {
          column_settings: {
            [columnKey]: {
              currency: "USD",
              currency_in_header: false,
              currency_style: "code",
              number_style: "currency",
            },
          },
        },
      });
      await visitQuestion(page, questionId);

      await expect(
        queryBuilderMain(page).getByText("USD 39.72", { exact: true }),
      ).toBeVisible();

      const opts = { questionId, fileType };

      await downloadAndAssert(page, { ...opts, enableFormatting: true });
      await downloadAndAssert(page, { ...opts, enableFormatting: false });
    });
  }

  test("should allow downloading pivoted results", async ({ page, mb }) => {
    // Pivot questions export through /api/dataset/:type (the FE re-runs them
    // ad-hoc style; verified empirically), so no questionId is passed to the
    // endpoint assertion — matching the Cypress original.
    const { id: questionId } = await createQuestion(mb.api, {
      name: "Pivot Table",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [
          ["datetime-field", ["field-id", PRODUCTS.CREATED_AT], "year"],
          ["field-id", PRODUCTS.CATEGORY],
        ],
      },
      display: "pivot",
    });
    await visitQuestion(page, questionId);

    await downloadAndAssert(page, {
      enableFormatting: true,
      fileType: "csv",
    });

    await downloadAndAssert(page, {
      enableFormatting: true,
      pivoting: "non-pivoted",
      fileType: "csv",
    });
  });

  test.describe("download format preference", () => {
    const FORMAT_PREF_PATH =
      "/api/user-key-value/namespace/last_download_format/key/download_format_preference";

    const waitForFormatSave = (page: Page) =>
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === FORMAT_PREF_PATH,
      );

    const waitForFormatFetch = (page: Page) =>
      page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === FORMAT_PREF_PATH,
      );

    test("should remember the selected format across page reloads", async ({
      page,
      mb,
    }) => {
      const { id: questionId } = await createQuestion(mb.api, {
        name: "Format Preference Test",
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
        display: "table",
      });
      await visitQuestion(page, questionId);

      await expect(
        viewFooter(page).getByText("Showing 5 rows", { exact: true }),
      ).toBeVisible();
      await viewFooter(page)
        .getByRole("button", { name: "Download results", exact: true })
        .click();

      const saveFormat = waitForFormatSave(page);
      await popover(page).getByText(".xlsx", { exact: true }).click();
      await saveFormat;

      // The preference GET fires when the download widget mounts (popover
      // open), not on page load — await it after the click.
      const fetchFormat = waitForFormatFetch(page);
      await visitQuestion(page, questionId);

      await expect(
        viewFooter(page).getByText("Showing 5 rows", { exact: true }),
      ).toBeVisible();
      await viewFooter(page)
        .getByRole("button", { name: "Download results", exact: true })
        .click();
      await fetchFormat;
      await expect(
        popover(page).getByText(".xlsx", { exact: true }).locator(".."),
      ).toHaveAttribute("data-active", "true");
    });

    test("should remember the download format on dashboards", async ({
      page,
      mb,
    }) => {
      const { id: questionId } = await createQuestion(mb.api, {
        name: "Dashboard Format Test",
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
        display: "table",
      });
      const { id: dashboardId } = await mb.api.createDashboard();
      await addOrUpdateDashboardCard(mb.api, {
        card_id: questionId,
        dashboard_id: dashboardId,
      });

      await visitDashboard(page, mb.api, dashboardId);

      await getDashboardCard(page, 0).hover();
      await (await getDashboardCardMenu(page, 0)).click();
      await popover(page).getByText("Download results", { exact: true }).click();

      const saveFormat = waitForFormatSave(page);
      await popover(page).getByText(".xlsx", { exact: true }).click();
      await saveFormat;

      const fetchFormat = waitForFormatFetch(page);
      await page.reload();

      await getDashboardCard(page, 0).hover();
      await (await getDashboardCardMenu(page, 0)).click();
      await popover(page).getByText("Download results", { exact: true }).click();
      await fetchFormat;
      await expect(
        popover(page).getByText(".xlsx", { exact: true }).locator(".."),
      ).toHaveAttribute("data-active", "true");
    });
  });

  test("respects renamed columns in self-joins", async ({ page, mb }) => {
    const idLeftRef = [
      "field",
      ORDERS.ID,
      {
        "base-type": "type/BigInteger",
      },
    ];
    const idRightRef = [
      "field",
      ORDERS.ID,
      {
        "base-type": "type/BigInteger",
        "join-alias": "Orders",
      },
    ];
    const totalLeftRef = [
      "field",
      ORDERS.TOTAL,
      {
        "base-type": "type/Float",
      },
    ];
    const totalRightRef = [
      "field",
      ORDERS.TOTAL,
      {
        "base-type": "type/Float",
        "join-alias": "Orders",
      },
    ];

    const totalLeftColumnKey = '["name","TOTAL"]';
    const totalRightColumnKey = '["name","TOTAL_2"]';

    const { id: questionId } = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        fields: [totalLeftRef],
        joins: [
          {
            fields: [totalRightRef],
            strategy: "left-join",
            alias: "Orders",
            condition: ["=", idLeftRef, idRightRef],
            "source-table": ORDERS_ID,
          },
        ],
        "order-by": [["desc", totalLeftRef]],
        limit: 1,
      },
      visualization_settings: {
        column_settings: {
          [totalLeftColumnKey]: {
            column_title: "Left Total",
          },
          [totalRightColumnKey]: {
            column_title: "Right Total",
          },
        },
      },
    });
    await visitQuestion(page, questionId);

    await expect(
      queryBuilderMain(page).getByText("Left Total", { exact: true }),
    ).toBeVisible();
    await expect(
      queryBuilderMain(page).getByText("Right Total", { exact: true }),
    ).toBeVisible();

    for (const fileType of testCases) {
      await downloadAndAssert(page, {
        questionId,
        fileType,
        enableFormatting: true,
      });
    }
  });

  test.describe("from dashboards", () => {
    test("should allow downloading card data", async ({ page, mb }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await page
        .getByTestId("dashcard")
        .getByTestId("legend-caption")
        .hover();

      await assertOrdersExport(page, 18760);

      await editDashboard(page);

      await setFilter(page, "ID");

      await getDashboardCard(page).getByText("Select…").click();
      await popover(page).getByText("ID", { exact: true }).first().click();

      await saveDashboard(page);

      await filterWidget(page).getByText("ID", { exact: true }).click();

      await popover(page).getByRole("combobox").pressSequentially("1");

      // The Cypress original waited on a GET /api/dashboard/** alias here;
      // the meaningful wait is the filtered dashcard query rerun.
      const filteredQuery = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
          `/api/dashboard/${ORDERS_DASHBOARD_ID}/dashcard/${ORDERS_DASHBOARD_DASHCARD_ID}/card/${ORDERS_QUESTION_ID}/query`,
      );
      await popover(page).getByText("Add filter", { exact: true }).click();
      await filteredQuery;

      await page
        .getByTestId("dashcard")
        .getByTestId("legend-caption")
        .hover();

      await assertOrdersExport(page, 1);
    });

    test("should allow downloading parameterized cards opened from dashboards as a user with no self-service permission (metabase#20868)", async ({
      page,
      mb,
    }) => {
      const { id: questionId } = await createQuestion(mb.api, {
        name: "20868",
        query: {
          "source-table": ORDERS_ID,
        },
        display: "table",
      });
      const { id: dashboardId } = await mb.api.createDashboard();
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        parameters: [
          {
            id: "92eb69ea",
            name: "ID",
            sectionId: "id",
            slug: "id",
            type: "id",
          },
        ],
      });

      const { id: dashcardId } = await addOrUpdateDashboardCard(mb.api, {
        card_id: questionId,
        dashboard_id: dashboardId,
        card: {
          parameter_mappings: [
            {
              parameter_id: "92eb69ea",
              card_id: questionId,
              target: ["dimension", ["field", ORDERS.ID, null]],
            },
          ],
          visualization_settings: {
            click_behavior: {
              parameterMapping: {
                "92eb69ea": {
                  id: "92eb69ea",
                  source: { id: "ID", name: "ID", type: "column" },
                  target: {
                    id: "92eb69ea",
                    type: "parameter",
                  },
                },
              },
            },
          },
        },
      });

      await mb.signIn("nodata");
      await visitDashboard(page, mb.api, dashboardId);

      await page.getByLabel("ID", { exact: true }).click();
      await popover(page).getByPlaceholder("Enter an ID").fill("1");
      await page
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await page
        .getByTestId("legend-caption")
        .getByText("20868", { exact: true })
        .click();

      // The row-count assertion is new here: the export must respect the
      // dashboard parameter (ID = 1), not just return a 200.
      await downloadAndAssert(page, {
        fileType: "xlsx",
        questionId,
        dashboardId,
        dashcardId,
        assertRowCount: 1,
      });
    });
  });

  test.describe("png images", () => {
    test("from dashboards", async ({ page, mb }) => {
      const { dashboard } = await createDashboardWithQuestions(mb.api, {
        dashboardName: "saving pngs dashboard",
        questions: [canSavePngQuestion, cannotSavePngQuestion],
      });
      await visitDashboard(page, mb.api, dashboard.id);

      await showDashboardCardActions(page, 0);
      await expect(
        getDashboardCard(page, 0).getByText("Created At: Month", {
          exact: true,
        }),
      ).toBeVisible();
      await (await getDashboardCardMenu(page, 0)).click();

      const pngDownload = await exportFromDashcard(page, ".png");
      await ensureDownloadStatusDismissed(page);

      await showDashboardCardActions(page, 1);
      await expect(
        getDashboardCard(page, 1).getByText("User ID", { exact: true }),
      ).toBeVisible();
      await (await getDashboardCardMenu(page, 1)).click();

      await popover(page)
        .getByText("Download results", { exact: true })
        .click();
      await expect(
        popover(page).getByText(".csv", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText(".png", { exact: true }),
      ).toHaveCount(0);

      // Port of cy.verifyDownload(".png", { contains: true }).
      expect(pngDownload.suggestedFilename()).toContain(".png");
    });

    test("from query builder", async ({ page, mb }) => {
      const { id: q1Id } = await createQuestion(mb.api, canSavePngQuestion);
      await visitQuestion(page, q1Id);

      await page
        .getByRole("button", { name: "Download results", exact: true })
        .click();

      const menu = popover(page);
      await menu.getByText(".png", { exact: true }).click();
      const downloadEvent = page.waitForEvent("download");
      await menu.getByTestId("download-results-button").click();
      const download = await downloadEvent;

      // Port of cy.verifyDownload(".png", { contains: true }).
      expect(download.suggestedFilename()).toContain(".png");
      await ensureDownloadStatusDismissed(page);

      const { id: q2Id } = await createQuestion(mb.api, cannotSavePngQuestion);
      await visitQuestion(page, q2Id);

      await page
        .getByRole("button", { name: "Download results", exact: true })
        .click();

      await expect(
        popover(page).getByText(".csv", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText(".png", { exact: true }),
      ).toHaveCount(0);
    });
  });
});

test.describe("scenarios > dashboard > download pdf", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    // cy.deleteDownloadsFolder() is unnecessary here: Playwright saves each
    // download to a unique temp path.
  });

  test("should allow you to download a PDF of a dashboard", async ({
    page,
    mb,
  }) => {
    const date = Date.now();
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      dashboardName: `saving pdf dashboard - ${date}`,
      questions: [canSavePngQuestion, cannotSavePngQuestion],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    const downloadEvent = page.waitForEvent("download");
    await openSharingMenu(page, "Export as PDF");

    const status = page.getByTestId("status-root-container");
    await expect(status).toContainText("Downloading");
    await expect(status).toContainText(
      `Dashboard for saving pdf dashboard - ${date}`,
    );

    // We're adding a "Metabase-" prefix for non-whitelabelled instances.
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(
      `Metabase - saving pdf dashboard - ${date}.pdf`,
    );
  });
});

test.describe("[snowplow] scenarios > dashboard", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow();
    await mb.signInAsAdmin();
    await enableTracking();
  });

  test.afterEach(async () => {
    await expectNoBadSnowplowEvents();
  });

  test("should allow you to download a PDF of a dashboard", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      dashboardName: "test dashboard",
      questions: [canSavePngQuestion, cannotSavePngQuestion],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    const downloadEvent = page.waitForEvent("download");
    await openSharingMenu(page, "Export as PDF");

    const status = page.getByTestId("status-root-container");
    await expect(status).toContainText("Downloading");
    await expect(status).toContainText("Dashboard for test dashboard");

    await downloadEvent;

    await expectUnstructuredSnowplowEvent({
      event: "dashboard_pdf_exported",
      dashboard_id: dashboard.id,
      dashboard_accessed_via: "internal",
    });
  });

  test("should send the `download_results_clicked` event when downloading dashcards results", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      dashboardName: "saving pngs dashboard",
      questions: [canSavePngQuestion, cannotSavePngQuestion],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    await showDashboardCardActions(page, 0);
    await expect(
      getDashboardCard(page, 0).getByText("Created At: Month", { exact: true }),
    ).toBeVisible();
    await (await getDashboardCardMenu(page, 0)).click();

    await exportFromDashcard(page, ".png");

    await expectUnstructuredSnowplowEvent({
      event: "download_results_clicked",
      resource_type: "dashcard",
      accessed_via: "internal",
      export_type: "png",
    });
  });
});

// === helpers ===

async function assertOrdersExport(page: Page, rowCount: number) {
  await downloadAndAssert(page, {
    fileType: "xlsx",
    questionId: ORDERS_QUESTION_ID,
    dashcardId: ORDERS_DASHBOARD_DASHCARD_ID,
    dashboardId: ORDERS_DASHBOARD_ID,
    isDashboard: true,
    // The Cypress helper accepted this count but never checked it; here the
    // downloaded sheet is actually parsed and counted.
    assertRowCount: rowCount,
  });
}

// TODO(snowplow): the Playwright spike has no snowplow-micro instance, so the
// tracking helpers (H.resetSnowplow, H.enableTracking,
// H.expectUnstructuredSnowplowEvent, H.expectNoBadSnowplowEvents) are no-ops.
// Port them for real once the harness grows snowplow support.
async function resetSnowplow() {}
async function enableTracking() {}
async function expectNoBadSnowplowEvents() {}
async function expectUnstructuredSnowplowEvent(
  _event: Record<string, unknown>,
) {}

// === local ports of `H` helpers not yet in support/ ===

type QuestionDetails = {
  name?: string;
  display?: string;
  query: Record<string, unknown>;
  visualization_settings?: Record<string, unknown>;
};

/** Port of api/createQuestion.ts (the subset these tests need). */
async function createQuestion(
  api: MetabaseApi,
  details: QuestionDetails,
): Promise<{ id: number }> {
  const {
    name = "test question",
    display = "table",
    query,
    visualization_settings = {},
  } = details;
  const response = await api.post("/api/card", {
    name,
    display,
    visualization_settings,
    dataset_query: { type: "query", query, database: SAMPLE_DB_ID },
  });
  return (await response.json()) as { id: number };
}

/** Port of api/addOrUpdateDashboardCard.ts — replaces the dashboard's cards. */
async function addOrUpdateDashboardCard(
  api: MetabaseApi,
  {
    card_id,
    dashboard_id,
    card = {},
  }: {
    card_id: number;
    dashboard_id: number;
    card?: Record<string, unknown>;
  },
): Promise<{ id: number }> {
  const response = await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        id: -1,
        row: 0,
        col: 0,
        size_x: 11,
        size_y: 8,
        visualization_settings: {},
        parameter_mappings: [],
        card_id,
        ...card,
      },
    ],
  });
  const { dashcards } = (await response.json()) as {
    dashcards: { id: number }[];
  };
  return dashcards[0];
}

/**
 * Port of api/createDashboardWithQuestions.ts: each question is appended to
 * the dashboard with the same default position/size as the Cypress factory.
 */
async function createDashboardWithQuestions(
  api: MetabaseApi,
  {
    dashboardName,
    questions,
  }: { dashboardName: string; questions: QuestionDetails[] },
): Promise<{ dashboard: { id: number } }> {
  const dashboard = await api.createDashboard({ name: dashboardName });
  for (const questionDetails of questions) {
    const { id: card_id } = await createQuestion(api, questionDetails);
    const { dashcards } = (await (
      await api.get(`/api/dashboard/${dashboard.id}`)
    ).json()) as { dashcards: unknown[] };
    await api.put(`/api/dashboard/${dashboard.id}`, {
      dashcards: [
        ...dashcards,
        { id: -1, card_id, row: 0, col: 0, size_x: 11, size_y: 8 },
      ],
    });
  }
  return { dashboard };
}

/** Port of H.visualize — waits for the ad-hoc dataset query to complete. */
async function visualize(page: Page) {
  const datasetResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
  await page
    .getByRole("button", { name: "Visualize", exact: true })
    .click();
  await datasetResponse;
}

function miniPicker(page: Page) {
  return page.getByTestId("mini-picker");
}

function queryBuilderMain(page: Page) {
  return page.getByTestId("query-builder-main");
}

function viewFooter(page: Page) {
  return page.getByTestId("view-footer");
}
