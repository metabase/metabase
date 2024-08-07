import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  addOrUpdateDashboardCard,
  assertSheetRowsCount,
  createQuestion,
  describeWithSnowplow,
  downloadAndAssert,
  editDashboard,
  enableTracking,
  entityPickerModal,
  entityPickerModalTab,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  filterWidget,
  getDashboardCard,
  getDashboardCardMenu,
  multiAutocompleteInput,
  popover,
  queryBuilderMain,
  resetSnowplow,
  restore,
  saveDashboard,
  setFilter,
  showDashboardCardActions,
  startNewQuestion,
  visitDashboard,
  visualize,
  dismissDownloadStatus,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const testCases = ["csv", "xlsx"];

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
    restore();
    cy.signInAsAdmin();
  });

  describeWithSnowplow("[snowplow]", () => {
    testCases.forEach(fileType => {
      it(`downloads ${fileType} file`, () => {
        startNewQuestion();
        entityPickerModal().within(() => {
          entityPickerModalTab("Saved questions").click();
          cy.findByText("Orders, Count").click();
        });

        visualize();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("18,760");

        downloadAndAssert({ fileType }, sheet => {
          expect(sheet["A1"].v).to.eq("Count");
          expect(sheet["A2"].v).to.eq(18760);
        });

        expectGoodSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "ad-hoc-question",
          accessed_via: "internal",
          export_type: fileType,
        });

        dismissDownloadStatus();
      });
    });
  });

  it("should allow downloading unformatted CSV data", () => {
    const fieldRef = ["field", ORDERS.TOTAL, null];
    const columnKey = `["ref",${JSON.stringify(fieldRef)}]`;

    createQuestion(
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

    queryBuilderMain().findByText("USD 39.72").should("exist");

    cy.get("@questionId").then(questionId => {
      const opts = { questionId, fileType: "csv" };

      downloadAndAssert(
        {
          ...opts,
          enableFormatting: true,
        },
        sheet => {
          expect(sheet["A1"].v).to.eq("Total");
          expect(sheet["A2"].v).to.eq("USD 39.72");
        },
      );

      dismissDownloadStatus();

      downloadAndAssert(
        {
          ...opts,
          enableFormatting: false,
        },
        sheet => {
          expect(sheet["A1"].v).to.eq("Total");
          expect(sheet["A2"].v).to.eq(39.718145389078366);
          expect(sheet["A2"].w).to.eq("39.718145389078366");
        },
      );
    });
  });

  describe("from dashboards", () => {
    it("should allow downloading card data", () => {
      cy.intercept("GET", "/api/dashboard/**").as("dashboard");
      visitDashboard(ORDERS_DASHBOARD_ID);
      cy.findByTestId("dashcard").within(() => {
        cy.findByTestId("legend-caption").realHover();
      });

      assertOrdersExport(18760);

      editDashboard();

      setFilter("ID");

      cy.findByTestId("dashcard-container").contains("Select…").click();
      popover().contains("ID").eq(0).click();

      saveDashboard();

      filterWidget().contains("ID").click();

      popover().within(() => multiAutocompleteInput().type("1"));

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filter").click();

      cy.wait("@dashboard");

      cy.findByTestId("dashcard").within(() => {
        cy.findByTestId("legend-caption").realHover();
      });

      assertOrdersExport(1);
    });

    it("should allow downloading parameterized cards opened from dashboards as a user with no self-service permission (metabase#20868)", () => {
      cy.createQuestion({
        name: "20868",
        query: {
          "source-table": ORDERS_ID,
        },
        display: "table",
      }).then(({ body: { id: questionId } }) => {
        cy.createDashboard().then(({ body: { id: dashboardId } }) => {
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

          addOrUpdateDashboardCard({
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
            visitDashboard(dashboardId);

            cy.findByLabelText("ID").click();
            popover().findByPlaceholderText("Enter an ID").type("1");
            cy.button("Add filter").click();

            cy.findByTestId("legend-caption").contains("20868").click();

            downloadAndAssert(
              {
                fileType: "xlsx",
                questionId,
                dashboardId,
                dashcardId: id,
              },
              sheet => {
                expect(sheet["A1"].v).to.eq("ID");
                expect(sheet["A2"].v).to.eq(1);

                assertSheetRowsCount(1)(sheet);
              },
            );

            dismissDownloadStatus();
          });
        });
      });
    });
  });

  describe("png images", () => {
    it("from dashboards", () => {
      cy.createDashboardWithQuestions({
        dashboardName: "saving pngs dashboard",
        questions: [canSavePngQuestion, cannotSavePngQuestion],
      }).then(({ dashboard }) => {
        visitDashboard(dashboard.id);
      });

      showDashboardCardActions(0);
      getDashboardCard(0).findByText("Created At").should("be.visible");
      getDashboardCardMenu(0).click();

      popover().within(() => {
        cy.findByText("Download results").click();
        cy.findByText(".png").click();
      });

      showDashboardCardActions(1);
      getDashboardCard(1).findByText("User ID").should("be.visible");
      getDashboardCardMenu(1).click();

      popover().within(() => {
        cy.findByText("Download results").click();
        cy.findByText(".png").should("not.exist");
      });

      cy.verifyDownload(".png", { contains: true });
    });

    it("from query builder", () => {
      cy.createQuestion(canSavePngQuestion, { visitQuestion: true });

      cy.findByTestId("download-button").click();

      popover().within(() => {
        cy.findByText(".png").click();
      });

      cy.verifyDownload(".png", { contains: true });

      cy.createQuestion(cannotSavePngQuestion, { visitQuestion: true });

      cy.findByTestId("download-button").click();

      popover().within(() => {
        cy.findByText(".png").should("not.exist");
      });
    });
  });
});

describe("scenarios > dashboard > download pdf", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.deleteDownloadsFolder();
  });
  it("should allow you to download a PDF of a dashboard", () => {
    const date = Date.now();
    cy.createDashboardWithQuestions({
      dashboardName: `saving pdf dashboard - ${date}`,
      questions: [canSavePngQuestion, cannotSavePngQuestion],
    }).then(({ dashboard }) => {
      visitDashboard(dashboard.id);
    });

    cy.findByLabelText("Move, trash, and more…").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Export as PDF").click();

    cy.verifyDownload(`saving pdf dashboard - ${date}.pdf`);
  });
});

describeWithSnowplow("[snowplow] scenarios > dashboard", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should allow you to download a PDF of a dashboard", () => {
    cy.createDashboardWithQuestions({
      dashboardName: "test dashboard",
      questions: [canSavePngQuestion, cannotSavePngQuestion],
    }).then(({ dashboard }) => {
      visitDashboard(dashboard.id);
      cy.findByLabelText("Move, trash, and more…").click();

      popover().findByText("Export as PDF").click();

      expectGoodSnowplowEvent({
        event: "dashboard_pdf_exported",
        dashboard_id: dashboard.id,
        dashboard_accessed_via: "internal",
      });
    });
  });

  it("should send the `download_results_clicked` event when downloading dashcards results", () => {
    cy.createDashboardWithQuestions({
      dashboardName: "saving pngs dashboard",
      questions: [canSavePngQuestion, cannotSavePngQuestion],
    }).then(({ dashboard }) => {
      visitDashboard(dashboard.id);
    });

    showDashboardCardActions(0);
    getDashboardCard(0).findByText("Created At").should("be.visible");
    getDashboardCardMenu(0).click();

    popover().within(() => {
      cy.findByText("Download results").click();
      cy.findByText(".png").click();
    });

    expectGoodSnowplowEvent({
      event: "download_results_clicked",
      resource_type: "dashcard",
      accessed_via: "internal",
      export_type: "png",
    });
  });
});

function assertOrdersExport(length) {
  downloadAndAssert(
    {
      fileType: "xlsx",
      questionId: ORDERS_QUESTION_ID,
      dashcardId: ORDERS_DASHBOARD_DASHCARD_ID,
      dashboardId: ORDERS_DASHBOARD_ID,
      isDashboard: true,
    },
    sheet => {
      expect(sheet["A1"].v).to.eq("ID");
      expect(sheet["A2"].v).to.eq(1);
      expect(sheet["B1"].v).to.eq("User ID");
      expect(sheet["B2"].v).to.eq(1);

      assertSheetRowsCount(length)(sheet);
    },
  );
}
