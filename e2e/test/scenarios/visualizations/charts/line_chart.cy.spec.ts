const { H } = cy;
import type { Interception } from "cypress/types/net-stubbing";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { CardId, DashboardId } from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const externalDatabaseId = 2;

describe("scenarios > visualizations > line chart", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should save series settings and a trend line, and show them after a reload (metabase#21452)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["cum-sum", ["field", ORDERS.QUANTITY, null]]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    H.openVizSettingsSidebar();

    cy.log("the trend line uses the insights the backend computes");
    H.leftSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByText("Trend line").click();
    });
    H.trendLine().should("be.visible");

    H.leftSidebar().findByText("Data").click();
    H.openSeriesSettings("Cumulative sum of Quantity");
    H.popover()
      .findByDisplayValue("Cumulative sum of Quantity")
      .clear()
      .type("Foo");
    H.popover().within(() => {
      cy.findByTestId("color-selector-button").findByRole("button").click();
    });
    H.popover()
      .should("have.length", 2)
      .last()
      .within(() => {
        cy.findByLabelText("#EF8C8C").realClick();
      });
    H.popover().first().findByText("Display type").click();

    cy.log("Dismiss the popup and close settings");
    H.leftSidebar().button("Done").click();

    // trigger("mousemove") is more reliable than realHover
    H.cartesianChartCircleWithColor("#EF8C8C").first().trigger("mousemove");
    H.assertEChartsTooltip({
      header: "2025",
      rows: [{ color: "#EF8C8C", name: "Foo", value: "3,236" }],
    });

    cy.log("changing the series settings does not run the query again");
    cy.get("@dataset.all").should("have.length", 1);

    H.saveQuestion("Line chart with series settings", { wrapId: true });
    cy.get<Interception>("@saveQuestion")
      .its("request.body")
      .should((body) => {
        expect(body.display).to.equal("line");
        expect(body.visualization_settings["graph.show_trendline"]).to.equal(
          true,
        );
        expect(body.visualization_settings.series_settings.sum).to.include({
          title: "Foo",
          color: "#EF8C8C",
        });
      });

    // open the saved question again, which reruns its query on the backend
    H.visitQuestion("@questionId");

    H.trendLine().should("be.visible");
    H.cartesianChartCircleWithColor("#EF8C8C").first().trigger("mousemove");
    H.assertEChartsTooltip({
      header: "2025",
      rows: [{ color: "#EF8C8C", name: "Foo", value: "3,236" }],
    });
  });

  describe("UXW-2696", () => {
    const getChartPoints = () =>
      H.echartsContainer().find("path[fill='hsla(0, 0%, 100%, 1.00)']");
    const getNoPointsMessage = () =>
      cy.findByRole("dialog", { name: /data points are off screen/i });

    const assertNoPoints = (assertMessage = true) => {
      getChartPoints().should("have.length", 0);
      if (assertMessage) {
        getNoPointsMessage().should("exist");
      }
    };

    const assertDataVisible = () => {
      getChartPoints().should("have.length.greaterThan", 0);
      getNoPointsMessage().should("not.exist");
    };

    const QUESTION_NAME = "Count of orders by month";

    beforeEach(() => {
      cy.signInAsAdmin();

      H.createQuestion(
        {
          name: QUESTION_NAME,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          display: "line",
          visualization_settings: {
            "graph.y_axis.min": 700,
            "graph.y_axis.max": 1000,
            "graph.y_axis.auto_range": false,
          },
        },
        { wrapId: true },
      );
    });

    it("should be able to open the menu on pinned cards", () => {
      H.visitCollection("root");
      H.openCollectionItemMenu(QUESTION_NAME);
      H.popover().findByText("Pin this").click();

      // assert that the menu trigger is not covered
      H.openPinnedItemMenu(QUESTION_NAME);
      H.popover().should("exist");
    });

    it("should show the message in documents", () => {
      //setup a document
      cy.visit("/document/new");
      H.documentContent().click();

      H.addToDocument("/ord", false);
      H.commandSuggestionItem(new RegExp(QUESTION_NAME)).click();

      H.getDocumentCard(QUESTION_NAME).within(() => {
        assertNoPoints();
      });

      H.openDocumentCardMenu(QUESTION_NAME);
      H.popover().findByText("Edit Visualization").click();

      H.getDocumentSidebar().within(() => {
        cy.findByRole("tab", { name: /axes/i }).click({ force: true });
        cy.findByLabelText("Auto y-axis range").should(
          "have.attr",
          "data-checked",
          "false",
        );

        cy.findByLabelText("Min").clear().type("70");
      });

      H.getDocumentCard(QUESTION_NAME).within(() => {
        assertDataVisible();
      });
    });

    describe("dashcard", () => {
      beforeEach(() => {
        cy.get<CardId>("@questionId").then((cardId) => {
          H.createDashboard(
            {
              name: "Test Dashboard",
            },
            {
              wrapId: true,
            },
          );

          cy.get<DashboardId>("@dashboardId").then((dashboardId) =>
            H.addQuestionToDashboard({ dashboardId, cardId }),
          );
        });
      });

      it("should show you a message on a dashboard", () => {
        cy.get<DashboardId>("@dashboardId").then((id) => H.visitDashboard(id));

        cy.findByTestId("dashcard").within(() => {
          assertNoPoints();
        });

        H.editDashboard();
        H.showDashcardVisualizerModalSettings(0, { isVisualizerCard: false });

        H.modal().within(() => {
          cy.findByRole("tab", { name: /axes/i }).click({ force: true });
          cy.findByLabelText("Auto y-axis range").should(
            "have.attr",
            "data-checked",
            "false",
          );

          H.echartsContainer().find("svg").should("exist");
          assertNoPoints(false);
          getNoPointsMessage().should("not.exist");

          cy.findByLabelText("Min").clear().type("70").blur();

          assertDataVisible();
        });
        H.saveDashcardVisualizerModal();

        H.dashboardSaveButton().click();

        cy.findByTestId("edit-bar").should("not.exist");

        cy.findByTestId("dashcard").within(() => {
          getChartPoints().should("have.length.greaterThan", 0);
        });
      });
    });
  });

  describe("color series", () => {
    it("should allow drag and drop", () => {
      const testQuery = {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
          ],
        },
        database: SAMPLE_DB_ID,
      };

      H.visitQuestionAdhoc({
        dataset_query: testQuery,
        display: "line",
      });

      H.openVizSettingsSidebar();

      // making sure the grabber icon is there
      cy.findAllByTestId("chart-setting-select")
        .then(($elements) => {
          for (const element of $elements) {
            if (
              element instanceof HTMLInputElement &&
              element.value === "Sum of Total"
            ) {
              return cy.wrap(element);
            }
          }
        })
        .closest("[data-testid=chartsettings-field-picker]")
        .icon("grabber");

      cy.log("Drag and drop the first y-axis field to the last position");
      cy.findAllByTestId("chart-setting-select").then((initial) => {
        cy.findByTestId("chart-settings-widget-graph.metrics").within(() => {
          cy.findAllByTestId("drag-handle").first().as("dragElement");
          H.moveDnDKitElementByAlias("@dragElement", {
            vertical: 50,
            useMouseEvents: true,
          });
        });

        cy.findAllByTestId("chart-setting-select").should((content) => {
          const getValue = (elements: JQuery<HTMLElement>, index: number) =>
            elements.eq(index).val();
          expect(getValue(content, 0)).to.eq(getValue(initial, 0)); // Created At: Month
          expect(getValue(content, 1)).to.eq(getValue(initial, 2)); // Sum of Total
          expect(getValue(content, 2)).to.eq(getValue(initial, 1)); // Count
        });
      });
    });
  });

  it("should apply brush filters to the series selecting area range when axis is a number", () => {
    const testQuery = {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.QUANTITY]],
      },
      database: SAMPLE_DB_ID,
    };

    cy.viewport(1280, 800);

    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    H.queryBuilderMain().within(() => {
      H.echartsContainer().findByText("Quantity").should("be.visible");
    });
    H.applyBrushToPoints(6, 10);

    cy.wait("@dataset");

    cy.findByTestId("filter-pill").should(
      "contain.text",
      "Quantity is between",
    );
    const X_AXIS_VALUE = 8;
    H.echartsContainer().within(() => {
      cy.get("text").contains("Quantity").should("be.visible");
      cy.findByText(X_AXIS_VALUE).should("be.visible");
    });
  });

  describe("with tracking", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.resetSnowplow();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should apply brush filters to a chart with series split into panels", () => {
      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.TOTAL, null]],
              ["avg", ["field", ORDERS.QUANTITY, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      H.openVizSettingsSidebar();
      H.leftSidebar().within(() => {
        cy.findByText("Display").click();
        cy.findByText("Stack series").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "stack_series_enabled",
        triggered_from: "viz_settings",
      });

      H.splitPanelSeparators().should("have.length", 1);

      // Change the display and color of a series, so they can be checked after the brush
      H.leftSidebar().findByText("Data").click();
      H.openSeriesSettings("Sum of Total");

      H.popover().within(() => {
        cy.findByTestId("color-selector-button").findByRole("button").click();
      });

      H.popover()
        .should("have.length", 2)
        .last()
        .within(() => {
          cy.findByLabelText("#EF8C8C").realClick();
        });

      H.popover().within(() => {
        cy.icon("bar").click();
      });

      H.leftSidebar().within(() => {
        cy.button("Done").click();
      });

      H.applyBrushToPoints(6, 10);

      cy.wait("@dataset");
      cy.findByTestId("qb-filters-panel").should(
        "contain",
        "Created At: Month is",
      );

      H.splitPanelSeparators().should("have.length", 1);
      H.chartPathWithFillColor("#EF8C8C").should("be.visible");
      H.cartesianChartCircleWithColor("#A989C5");
    });
  });
});

describe(
  "scenarios > visualizations > line chart (Mongo)",
  { tags: "@mongo" },
  () => {
    function replaceMissingValuesWith(value: string) {
      cy.get('[data-field-title="Replace missing values with"]').within(() => {
        cy.findByTestId("chart-setting-select").click();
      });

      H.popover().contains(value).click();
      H.popover().findByDisplayValue(value);

      // click outside popover
      cy.findByTestId("chartsettings-list-container").click();
    }

    function assertOnTheYAxis() {
      H.echartsContainer().find("text").contains("Count");

      H.echartsContainer().find("text").contains("7.0k").should("be.visible");
    }

    beforeEach(() => {
      H.restore("mongo-5");
      cy.signInAsAdmin();

      H.withDatabase(externalDatabaseId, ({ ORDERS, ORDERS_ID }) => {
        const questionDetails: StructuredQuestionDetails = {
          name: "16170",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          database: externalDatabaseId,
          display: "line",
        };

        H.createQuestion(questionDetails, { visitQuestion: true });
      });
    });

    ["Zero", "Nothing"].forEach((replacementValue) => {
      it(`replace missing values with "${replacementValue}" should work on Mongo (metabase#16170)`, () => {
        H.openVizSettingsSidebar();

        H.openSeriesSettings("Count");

        replaceMissingValuesWith(replacementValue);

        assertOnTheYAxis();

        H.cartesianChartCircle()
          .should("have.length", 6)
          .eq(-2)
          .trigger("mousemove");

        H.assertEChartsTooltip({
          header: "2019",
          rows: [
            {
              name: "Count",
              value: "6,524",
            },
          ],
        });
      });
    });
  },
);
