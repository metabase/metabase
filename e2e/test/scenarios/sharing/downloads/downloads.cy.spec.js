const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const testCases = ["csv", "xlsx"];

const formatUrl =
  "/api/user-key-value/namespace/last_download_format/key/download_format_preference";

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

describe("scenarios > question > download", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("[snowplow]", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("downloads csv and xlsx files", () => {
      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("Orders, Count").click();
      });

      H.visualize();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("18,760");

      testCases.forEach((fileType) => {
        H.downloadAndAssert({ fileType });

        H.expectUnstructuredSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "ad-hoc-question",
          accessed_via: "internal",
          export_type: fileType,
        });
      });
    });
  });

  it("should allow downloading unformatted csv and xlsx data", () => {
    const fieldRef = ["field", ORDERS.TOTAL, null];
    const columnKey = `["ref",${JSON.stringify(fieldRef)}]`;

    H.createQuestion(
      {
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
      },
      { visitQuestion: true, wrapId: true },
    );

    H.queryBuilderMain().findByText("USD 39.72").should("exist");

    cy.get("@questionId").then((questionId) => {
      testCases.forEach((fileType) => {
        const opts = { questionId, fileType };

        H.downloadAndAssert({
          ...opts,
          enableFormatting: true,
        });

        H.downloadAndAssert({
          ...opts,
          enableFormatting: false,
        });
      });
    });
  });

  it("should allow downloading pivoted results", () => {
    H.createQuestion(
      {
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
      },
      { visitQuestion: true },
    );

    H.downloadAndAssert({
      enableFormatting: true,
      fileType: "csv",
    });

    H.downloadAndAssert({
      enableFormatting: true,
      pivoting: "non-pivoted",
      fileType: "csv",
    });
  });

  describe("download format preference", () => {
    beforeEach(() => {
      cy.intercept("PUT", formatUrl).as("saveFormat");
      cy.intercept("GET", formatUrl).as("fetchFormat");
    });

    it("should show tooltips for the download and share buttons and remember the downloaded format across page reloads (metabase#16108)", () => {
      H.createQuestion(
        {
          name: "Format Preference Test",
          query: {
            "source-table": ORDERS_ID,
            limit: 5,
          },
          display: "table",
        },
        { visitQuestion: true, wrapId: true, idAlias: "questionId" },
      );

      cy.findByTestId("view-footer")
        .findByText("Showing 5 rows")
        .should("be.visible");

      cy.icon("download").realHover();
      H.tooltip().findByText("Download results");
      H.sharingMenuButton().realHover();
      H.tooltip().findByText("Share");

      cy.findByTestId("view-footer").button("Download results").click();

      H.popover().findByText(".xlsx").click();
      cy.findByTestId("download-results-button").click();
      cy.wait("@saveFormat");

      cy.get("@questionId").then((id) => {
        H.visitQuestion(id);
      });

      cy.wait("@fetchFormat");
      cy.findByTestId("view-footer")
        .findByText("Showing 5 rows")
        .should("be.visible");
      cy.findByTestId("view-footer").button("Download results").click();
      H.popover().within(() => {
        cy.findByText(".xlsx")
          .parent()
          .should("have.attr", "data-active", "true");
        cy.findByText(".png").should("not.exist");
      });
    });
  });

  it("respects renamed columns in self-joins", () => {
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

    H.createQuestion(
      {
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
      },
      { visitQuestion: true, wrapId: true },
    );

    H.queryBuilderMain().findByText("Left Total").should("exist");
    H.queryBuilderMain().findByText("Right Total").should("exist");

    cy.get("@questionId").then((questionId) => {
      testCases.forEach((fileType) => {
        const opts = { questionId, fileType };

        H.downloadAndAssert({
          ...opts,
          enableFormatting: true,
        });
      });
    });
  });

  describe("from dashboards", () => {
    it("should allow downloading card data and remember the downloaded format", () => {
      cy.intercept("PUT", formatUrl).as("saveFormat");
      cy.intercept("GET", formatUrl).as("fetchFormat");
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      cy.findByTestId("dashcard").within(() => {
        cy.findByTestId("legend-caption").realHover();
      });

      // In CI agents after downloads Cypress gets stuck for a while so the downloads status gets closed by timeout
      assertOrdersExport();
      cy.wait("@saveFormat");

      cy.reload();
      cy.wait("@fetchFormat");

      H.getDashboardCard(0).realHover();
      H.getDashboardCardMenu(0).click();
      H.popover().findByText("Download results").click();
      H.popover().within(() => {
        cy.findByText(".xlsx")
          .parent()
          .should("have.attr", "data-active", "true");
      });
      cy.realPress("Escape");
      H.popover({ skipVisibilityCheck: true }).should("not.exist");

      H.editDashboard();

      H.setFilter("ID");

      cy.findByTestId("dashcard-container").contains("Select…").click();
      H.popover().contains("ID").eq(0).click();

      H.saveDashboard();

      H.filterWidget().contains("ID").click();

      H.popover().within(() => H.fieldValuesCombobox().type("1"));

      cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
        "dashcardQuery",
      );
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filter").click();

      cy.wait("@dashcardQuery");

      cy.findByTestId("dashcard").within(() => {
        cy.findByTestId("legend-caption").realHover();
      });

      // In CI agents after downloads Cypress gets stuck for a while so the downloads status gets closed by timeout
      assertOrdersExport({ assertParameters: [{ type: "id" }] });
    });

    it("should allow downloading parameterized cards opened from dashboards as a user with no self-service permission (metabase#20868)", () => {
      H.createQuestion({
        name: "20868",
        query: {
          "source-table": ORDERS_ID,
        },
        display: "table",
      }).then(({ body: { id: questionId } }) => {
        H.createDashboard().then(({ body: { id: dashboardId } }) => {
          cy.request("PUT", `/api/dashboard/${dashboardId}`, {
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

          H.addOrUpdateDashboardCard({
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
          }).then(({ body: { id } }) => {
            cy.signIn("nodata");
            H.visitDashboard(dashboardId);

            cy.findByLabelText("ID").click();
            H.popover().findByPlaceholderText("Enter an ID").type("1");
            cy.button("Add filter").click();

            cy.findByTestId("legend-caption").contains("20868").click();

            H.downloadAndAssert({
              fileType: "xlsx",
              questionId,
              dashboardId,
              dashcardId: id,
            });
          });
        });
      });
    });
  });

  describe("png images", () => {
    beforeEach(() => {
      cy.deleteDownloadsFolder();
    });

    it("from query builder", () => {
      H.createQuestion(canSavePngQuestion, { visitQuestion: true });

      cy.findByRole("button", { name: "Download results" }).click();

      H.popover().within(() => {
        cy.findByText(".png").click();
        cy.findByTestId("download-results-button").click();
      });

      cy.verifyDownload(".png", { contains: true });
    });
  });
});

describe("[snowplow] scenarios > dashboard", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
    cy.deleteDownloadsFolder();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should download a PDF of a dashboard and png images from dashcards", () => {
    const date = Date.now();
    H.createDashboardWithQuestions({
      dashboardName: `saving pdf dashboard - ${date}`,
      questions: [canSavePngQuestion, cannotSavePngQuestion],
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
      H.openSharingMenu("Export as PDF");

      cy.findByTestId("status-root-container")
        .should("contain", "Downloading")
        .and("contain", `Dashboard for saving pdf dashboard - ${date}`);

      H.expectUnstructuredSnowplowEvent({
        event: "dashboard_pdf_exported",
        dashboard_id: dashboard.id,
        dashboard_accessed_via: "internal",
      });
    });

    cy.log("We're adding a 'Metabase-' prefix for non-whitelabelled instances");
    cy.verifyDownload(`Metabase - saving pdf dashboard - ${date}.pdf`);
    H.ensureDownloadStatusDismissed();

    H.showDashboardCardActions(0);
    H.getDashboardCard(0).findByText("Created At: Month").should("be.visible");
    H.getDashboardCardMenu(0).click();

    H.exportFromDashcard(".png");

    H.expectUnstructuredSnowplowEvent({
      event: "download_results_clicked",
      resource_type: "dashcard",
      accessed_via: "internal",
      export_type: "png",
    });

    H.showDashboardCardActions(1);
    H.getDashboardCard(1).findByText("User ID").should("be.visible");
    H.getDashboardCardMenu(1).click();

    H.popover().within(() => {
      cy.findByText("Download results").click();
      cy.findByText(".csv").should("be.visible");
      cy.findByText(".png").should("not.exist");
    });

    cy.verifyDownload(".png", { contains: true });
  });
});

function assertOrdersExport({ assertParameters } = {}) {
  H.downloadAndAssert({
    fileType: "xlsx",
    questionId: ORDERS_QUESTION_ID,
    dashcardId: ORDERS_DASHBOARD_DASHCARD_ID,
    dashboardId: ORDERS_DASHBOARD_ID,
    isDashboard: true,
    assertParameters,
  });
}
