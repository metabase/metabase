const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

const externalDatabaseId = 2;

const testQuery = {
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"]],
  },
  database: SAMPLE_DB_ID,
};

describe("scenarios > visualizations > line chart", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to change y axis position (metabase#13487)", () => {
    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    H.openVizSettingsSidebar();
    H.openSeriesSettings("Count");

    H.echartsContainer()
      .findByText("Count")
      .then((label) => {
        const { x, y } = H.getXYTransform(label);
        cy.wrap({ x, y }).as("leftAxisLabelPosition");
      });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Right").click();
    H.echartsContainer()
      .findByText("Count")
      .then((label) => {
        const { x: xRight, y: yRight } = H.getXYTransform(label);
        cy.get("@leftAxisLabelPosition").then(({ x: xLeft, y: yLeft }) => {
          expect(yRight).to.be.eq(yLeft);
          expect(xRight).to.be.greaterThan(xLeft);
        });
      });
  });

  it("should display line settings only for line/area charts", () => {
    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    H.openVizSettingsSidebar();
    H.openSeriesSettings("Count");

    H.popover().within(() => {
      // For line chart
      cy.findByText("Line shape").should("exist");
      cy.findByText("Line style").should("exist");
      cy.findByText("Line size").should("exist");
      cy.findByText("Show dots on lines").should("exist");

      // For area chart
      cy.icon("area").click();
      cy.findByText("Line shape").should("exist");
      cy.findByText("Line style").should("exist");
      cy.findByText("Line size").should("exist");
      cy.findByText("Show dots on lines").should("exist");

      // For bar chart
      cy.icon("bar").click();
      cy.findByText("Line shape").should("not.exist");
      cy.findByText("Line style").should("not.exist");
      cy.findByText("Line size").should("not.exist");
      cy.findByText("Show dots on lines").should("not.exist");
    });
  });

  it("should allow changing formatting settings", () => {
    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    H.openVizSettingsSidebar();

    cy.log("x-axis column settings (metabase#51952)");
    cy.findByTestId("settings-CREATED_AT").click();
    H.popover().findByText("Abbreviate days and months").click();
    H.echartsContainer().findByText("Jan 2027");
    cy.realPress("Escape");
    cy.get("[data-element-id=mantine-popover]")
      .filter(":visible")
      .should("not.exist");

    H.openSeriesSettings("Count");

    H.popover().within(() => {
      cy.findByText("Formatting").click();

      cy.findByText("Add a prefix").should("exist");
      cy.findByPlaceholderText("$").type("prefix").blur();
    });

    H.echartsContainer().findByText("prefix0");
  });

  it("should reset series settings when switching to line chart", () => {
    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "area",
    });

    H.openVizSettingsSidebar();
    H.openSeriesSettings("Count");
    cy.icon("bar").click();

    H.openVizTypeSidebar();

    cy.icon("line").click();

    // should be a line chart
    H.cartesianChartCircleWithColor("#509EE3");
  });

  it("should reset stacking settings when switching to line chart (metabase#43538)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, null],
          ],
        },
        type: "query",
      },
      display: "bar",
      visualization_settings: {
        "stackable.stack_type": "normalized",
      },
    });

    H.openVizTypeSidebar();

    cy.icon("line").click();

    H.cartesianChartCircleWithColor("#A989C5");

    // Y-axis scale should not be normalized
    H.echartsContainer().findByText("100%").should("not.exist");
  });

  it("should be able to format data point values style independently on multi-series chart (metabase#13095)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.TOTAL, null]],
            [
              "aggregation-options",
              ["/", ["avg", ["field", ORDERS.QUANTITY, null]], 10],
              { "display-name": "AvgPct" },
            ],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.show_values": true,
        column_settings: {
          '["name","expression"]': { number_style: "percent" },
        },
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["sum", "expression"],
      },
    });

    H.echartsContainer().get("text").contains("39.75%");
  });

  it("should let unpin y-axis from zero", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["avg"],
      },
    });

    // The chart is pinned to zero by default: 0 tick should exist
    H.echartsContainer().findByText("0");

    H.openVizSettingsSidebar();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findByText("Axes").click();
      cy.findByText("Unpin from zero").click();
    });

    // Ensure unpinned chart does not have 0 tick
    H.echartsContainer().findByText("0").should("not.exist");

    cy.findByTestId("chartsettings-sidebar")
      .findByText("Unpin from zero")
      .click();

    H.echartsContainer().findByText("0");
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

    it("should show you a popover when all data points are outside the y-axis range in the notebook editor", () => {
      cy.get("@questionId").then((id) => H.visitQuestion(id));

      assertNoPoints();

      // Check that message is displayed
      cy.findByRole("dialog", { name: /data points are off screen/i });

      H.openVizSettingsSidebar();

      H.vizSettingsSidebar().findByText("Axes").click();
      H.vizSettingsSidebar().findByLabelText("Min").clear().type("70").blur();

      assertDataVisible();

      H.vizSettingsSidebar().findByLabelText("Min").clear().type("700").blur();

      assertNoPoints();

      cy.findByRole("switch", { name: /auto y-axis range/i }).click({
        force: true,
      });

      assertDataVisible();
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
        cy.get("@questionId").then((cardId) => {
          H.createDashboard(
            {
              name: "Test Dashboard",
            },
            {
              wrapId: true,
            },
          );

          cy.get("@dashboardId").then((dashboardId) =>
            H.addQuestionToDashboard({ dashboardId, cardId }),
          );
        });
      });

      it("should show you a message on a dashboard", () => {
        cy.get("@dashboardId").then((id) => H.visitDashboard(id));

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

  it("should display an error message when there are more series than the chart supports", () => {
    H.visitQuestionAdhoc({
      display: "line",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.TITLE, null],
          ],
        },
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "TITLE"],
        "graph.metrics": ["count"],
      },
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "This chart type doesn't support more than 100 series of data.",
    );
  });

  it("should not allow adding more series when all columns are used (metabase#11249)", () => {
    H.visitQuestionAdhoc({
      name: "13960",
      display: "line",
      dataset_query: {
        type: "query",
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["avg"],
      },
    });

    H.openVizSettingsSidebar();

    cy.findByTestId("sidebar-left").within(() => {
      cy.findByText("Data").click();
      cy.findByDisplayValue("Count").should("not.exist");

      cy.findByText("Add another series").click();
      cy.findByDisplayValue("Count").should("be.visible");
      cy.findByText("Add another series").should("not.exist");
    });
  });

  it("should render a chart with many columns without freezing (metabase#21392)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: `
  WITH
     L0   AS (SELECT c FROM (SELECT 1 UNION ALL SELECT 1) AS D(c)) -- 2^1
    ,L1   AS (SELECT 1 AS c FROM L0 AS A CROSS JOIN L0 AS B)       -- 2^2
    ,L2   AS (SELECT 1 AS c FROM L1 AS A CROSS JOIN L1 AS B)       -- 2^4
    ,L3   AS (SELECT 1 AS c FROM L2 AS A CROSS JOIN L0 AS B)       -- 2^5

  SELECT ROWNUM() id, DATEADD('DAY', ROWNUM(), CURRENT_DATE)::DATE date,
  RAND() c00, RAND() c01, RAND() c02, RAND() c03, RAND() c04, RAND() c05, RAND() c06, RAND() c07, RAND() c08, RAND() c09,
  RAND() c10, RAND() c11, RAND() c12, RAND() c13, RAND() c14, RAND() c15, RAND() c16, RAND() c17, RAND() c18, RAND() c19,
  RAND() c20, RAND() c21, RAND() c22, RAND() c23, RAND() c24, RAND() c25, RAND() c26, RAND() c27, RAND() c28, RAND() c29,
  RAND() c30, RAND() c31
  FROM L3
      `,
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });
    H.echartsContainer().should("be.visible");
    H.ensureEchartsContainerHasSvg();
  });

  it("should correctly display tooltip values when X-axis is numeric and style is 'Ordinal' (metabase#15998)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["count"],
            ["sum", ["field", ORDERS.TOTAL, null]],
            ["avg", ["field", ORDERS.QUANTITY, null]],
          ],
          breakout: [
            ["field", PRODUCTS.RATING, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        type: "query",
      },
      display: "line",
      visualization_settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.dimensions": ["RATING"],
        "graph.metrics": ["count", "sum", "avg"],
      },
    });

    H.cartesianChartCircleWithColor("#509EE3").eq(3).realHover();
    H.assertEChartsTooltip({
      header: "2.7",
      rows: [
        {
          color: "#509EE3",
          name: "Count",
          value: "191",
        },
        {
          color: "#88BF4D",
          name: "Sum of Total",
          value: "14,747.05",
        },
        {
          color: "#A989C5",
          name: "Average of Quantity",
          value: "4.3",
        },
      ],
    });
  });

  it("should show chart tooltip on narrow ordinal line charts (metabase#47847)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.show_values": true,
      },
    });

    H.cartesianChartCircleWithColor("#509EE3").eq(0).trigger("mousemove");
    H.assertEChartsTooltip({
      header: "April 27 – May 3, 2025", // expect this to break when we shift years in the Sample Database
      blurAfter: false,
      footer: null,
      rows: [
        {
          color: "#509EE3",
          name: "Count",
          value: "1",
        },
      ],
    });
  });

  it("should be possible to update/change label for an empty row value (metabase#12128)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT '2026-03-01'::date as date, 'cat1' as category, 23 as \"value\"\nUNION ALL\nSELECT '2026-03-01'::date, '', 44\nUNION ALL\nSELECT  '2026-03-01'::date, 'cat3', 58\n\nUNION ALL\n\nSELECT '2026-03-02'::date as date, 'cat1' as category, 20 as \"value\"\nUNION ALL\nSELECT '2026-03-02'::date, '', 50\nUNION ALL\nSELECT  '2026-03-02'::date, 'cat3', 58",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["DATE", "CATEGORY"],
        "graph.metrics": ["VALUE"],
      },
    });

    H.openVizSettingsSidebar();

    // Make sure we can update input with some existing value
    H.openSeriesSettings("cat1", true);
    H.popover().within(() => {
      cy.findByDisplayValue("cat1").type(" new").blur();
      cy.findByDisplayValue("cat1 new");
      cy.wait(500);
    });
    // Now do the same for the input with no value
    H.openSeriesSettings("(empty)", true);
    H.popover().within(() => {
      cy.findAllByTestId("series-name-input").clear().type("cat2").blur();
      cy.findByDisplayValue("cat2");
    });
    cy.button("Done").click();

    cy.findAllByTestId("legend-item")
      .should("contain", "cat1 new")
      .and("contain", "cat2")
      .and("contain", "cat3");
  });

  it("should interpolate null value by not rendering a data point (metabase#4122)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: `
            select 'a' x, 1 y
            union all
            select 'b' x, null y
            union all
            select 'c' x, 2 y
          `,
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    H.cartesianChartCircle().should("have.length", 2);
  });

  it("should show the trend line", () => {
    H.visitQuestionAdhoc({
      display: "line",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              { "base-type": "type/DateTime", "temporal-unit": "month" },
            ],
          ],
        },
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.show_trendline": true,
        "graph.show_goal": false,
        "graph.show_values": false,
        "graph.metrics": ["count"],
      },
    });

    H.trendLine().should("be.visible");
  });

  it("should show label for empty value series breakout (metabase#32107)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: `
            select 1 id, 50 val1, null val2
            union all select 2, 75, null
            union all select 3, 175, null
            union all select 4, 200, null
            union all select 5, 280, null
          `,
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["ID", "VAL2"],
        "graph.series_order_dimension": null,
        "graph.series_order": null,
        "graph.metrics": ["VAL1"],
      },
    });

    cy.findByTestId("visualization-root")
      .findByTestId("legend-item")
      .findByText("(empty)")
      .should("be.visible");

    H.openVizSettingsSidebar();
    cy.findByTestId("chartsettings-sidebar").findByText("(empty)");
  });

  describe("y-axis splitting (metabase#12939)", () => {
    it("should not split the y-axis when columns are of the same semantic_type and have close values", () => {
      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["avg", ["field", ORDERS.TOTAL, null]],
              ["min", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      cy.get("g.axis.yr").should("not.exist");
    });

    it("should split the y-axis when columns are of different semantic_type", () => {
      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": PEOPLE_ID,
            aggregation: [
              ["avg", ["field", PEOPLE.LATITUDE, null]],
              ["avg", ["field", PEOPLE.LONGITUDE, null]],
            ],
            breakout: [
              ["field", PEOPLE.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      H.echartsContainer().within(() => {
        cy.findByText("Average of Latitude").should("be.visible");
        cy.findByText("Average of Longitude").should("be.visible");
      });
    });

    it("should split the y-axis when columns are of the same semantic_type but have far values", () => {
      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.TOTAL, null]],
              ["min", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      H.echartsContainer().within(() => {
        cy.findByText("Sum of Total").should("be.visible");
        cy.findByText("Min of Total").should("be.visible");
      });
    });

    it("should not split the y-axis when the setting is disabled", () => {
      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.TOTAL, null]],
              ["min", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
        visualization_settings: {
          "graph.y_axis.auto_split": false,
        },
      });

      cy.get("g.axis.yr").should("not.exist");
    });

    it("should label each side of a split y-axis separately", () => {
      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.TOTAL, null]],
              ["min", ["field", ORDERS.TOTAL, null]],
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
      H.vizSettingsSidebar().findByText("Axes").click();

      cy.log("an unset right label inherits the left one");
      H.vizSettingsSidebar()
        .findByLabelText("Left axis label")
        .clear()
        .type("Revenue")
        .blur();
      H.vizSettingsSidebar()
        .findByLabelText("Right axis label")
        .should("have.value", "Revenue");
      H.echartsContainer().findAllByText("Revenue").should("have.length", 2);

      cy.log("the right label applies to the right axis only");
      H.vizSettingsSidebar()
        .findByLabelText("Right axis label")
        .clear()
        .type("Smallest order")
        .blur();
      H.echartsContainer()
        .findByText("Revenue")
        .then((leftLabel) => {
          const { x: xLeft } = H.getXYTransform(leftLabel);
          H.echartsContainer()
            .findByText("Smallest order")
            .then((rightLabel) => {
              const { x: xRight } = H.getXYTransform(rightLabel);
              expect(xRight).to.be.greaterThan(xLeft);
            });
        });

      cy.log("a chart with one y-axis offers one label");
      H.vizSettingsSidebar().findByText("Split y-axis when necessary").click();
      H.echartsContainer().findByText("Revenue").should("be.visible");
      H.echartsContainer().findByText("Smallest order").should("not.exist");
      H.vizSettingsSidebar().findByDisplayValue("Revenue").should("be.visible");
      H.vizSettingsSidebar()
        .findByLabelText("Right axis label")
        .should("not.exist");
      H.vizSettingsSidebar()
        .findByLabelText("Left axis label")
        .should("not.exist");
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
            if (element.value === "Sum of Total") {
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
          expect(content[0].value).to.eq(initial[0].value); // Created At: Month
          expect(content[1].value).to.eq(initial[2].value); // Sum of Total
          expect(content[2].value).to.eq(initial[1].value); // Count
        });
      });
    });

    it("should allow changing a series' color - #53735", () => {
      H.visitQuestionAdhoc({
        dataset_query: testQuery,
        display: "line",
      });

      H.openVizSettingsSidebar();
      H.openSeriesSettings("Count");

      H.popover().within(() => {
        cy.findByTestId("color-selector-button").button().click();
      });

      H.popover()
        .should("have.length", 2)
        .last()
        .within(() => {
          cy.findByLabelText("#EF8C8C").realClick();
        });

      cy.button("Done").click();

      H.cartesianChartCircleWithColor("#EF8C8C");
    });
  });

  describe("problems with the labels when showing only one row in the results (metabase#12782, metabase#4995)", () => {
    beforeEach(() => {
      H.visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
              ["field", PRODUCTS.CATEGORY, null],
            ],
            filter: ["=", ["field", PRODUCTS.CATEGORY, null], "Doohickey"],
          },
          type: "query",
        },
        display: "line",
      });
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Category is Doohickey");
    });

    it("should not drop the chart legend (metabase#4995)", () => {
      cy.findAllByTestId("legend-item").should("contain", "Doohickey");

      cy.log("Ensure that legend is hidden when not dealing with multi series");
      H.openVizSettingsSidebar();
      cy.findByTestId("remove-CATEGORY").click();
      H.queryBuilderMain().should("not.contain", "Doohickey");
    });

    it("should display correct axis labels (metabase#12782)", () => {
      H.echartsContainer()
        .get("text")
        .contains("Created At")
        .should("be.visible");
      H.echartsContainer()
        .get("text")
        .contains("Average of Price")
        .should("be.visible");
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

  it("should format goal tooltip value to match y-axis tick formatting", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.goal_value": 5000,
        "graph.show_goal": true,
        "graph.label_value_formatting": "compact",
        column_settings: {
          '["name","sum"]': {
            number_style: "currency",
            currency: "USD",
          },
        },
      },
    });

    H.echartsContainer().findByText("$50.0k").should("exist");
    H.goalLineMarker().trigger("mousemove");

    H.tooltip().within(() => {
      cy.findByText("Goal:").should("exist");
      cy.findByText("$5,000.00").should("exist");
    });
  });

  it("should support formatting goal tooltip value as a percent", () => {
    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
      visualization_settings: {
        "graph.goal_value": 123.4567,
        "graph.show_goal": true,
        "graph.label_value_formatting": "compact",
        column_settings: {
          '["name","count"]': {
            number_style: "percent",
          },
        },
      },
    });

    H.echartsContainer().findByText("50.0k%").should("exist");
    H.goalLineMarker().trigger("mousemove");

    H.tooltip().within(() => {
      cy.findByText("Goal:").should("exist");
      cy.findByText("12,345.67%").should("exist");
    });
  });

  it("should not crash when removing dimension aggregation column from the query (metabase#59671)", () => {
    const questionDetails = {
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        aggregation: [["count"]],
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();
    H.removeSummaryGroupingField({
      field: "Created At: Month",
      stage: 0,
      index: 0,
    });
    H.visualize();

    cy.findByTestId("visualization-placeholder").should("be.visible");
    cy.icon("warning").should("not.exist");
  });

  it("should not crash when saved dimension settings refer to a non-existent column (metabase#59830)", () => {
    const questionDetails = {
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
        aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
      },
      visualization_settings: {
        "graph.dimensions": ["DOES_NOT_EXIST"],
        "graph.metrics": ["count"],
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });
    cy.icon("warning").should("not.exist");
    cy.findByTestId("chart-container").should("be.visible");
  });

  it("should show an empty state when no dimensions are available (metabase#54755)", () => {
    const questionDetails = {
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      visualization_settings: {
        "graph.dimensions": [],
        "graph.metrics": ["count"],
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });
    cy.icon("warning").should("not.exist");
    cy.findByTestId("visualization-placeholder").should("be.visible");
  });

  it("should not crash the app when rendering a line chart with broken viz settings and table metadata (metabase#54271)", () => {
    cy.signInAsAdmin();

    cy.log("broken semantic type - the field cannot be parsed as a date");
    cy.request("PUT", `/api/field/${REVIEWS.REVIEWER}`, {
      semantic_type: "type/CreationDate",
    });

    cy.log("broken viz settings - dimensions cannot have a text column");
    H.createQuestion(
      {
        query: {
          "source-table": REVIEWS_ID,
          aggregation: [["count"]],
          breakout: [["field", REVIEWS.REVIEWER, null]],
        },
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["REVIEWER"],
          "graph.metrics": [["count"]],
        },
      },
      { visitQuestion: true },
    );

    cy.log("no clear expectations but the app should not crash");
    H.assertQueryBuilderRowCount(1076);
  });

  describe("issue 21452", () => {
    beforeEach(() => {
      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["cum-sum", ["field", ORDERS.QUANTITY, null]]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          database: 1,
        },
        display: "line",
      });

      H.openVizSettingsSidebar();
    });

    it("should not fire POST request after every character during display name change (metabase#21452)", () => {
      H.openSeriesSettings("Cumulative sum of Quantity");
      H.popover()
        .findByDisplayValue("Cumulative sum of Quantity")
        .clear()
        .type("Foo");

      H.popover().findByText("Display type").click();

      cy.log("Dismiss the popup and close settings");
      H.leftSidebar().button("Done").click();

      // trigger("mousemove") is more reliable than realHover
      // maybe related to https://github.com/dmtrKovalenko/cypress-real-events/issues/691
      H.cartesianChartCircle().first().trigger("mousemove");

      H.assertEChartsTooltip({
        header: "2025",
        rows: [
          {
            color: "#88BF4D",
            name: "Foo",
            value: "3,236",
          },
        ],
      });

      cy.get("@dataset.all").should("have.length", 1);
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

    it("should split series into panels and render each series in its own panel", () => {
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

      cy.findAllByTestId("legend-item").should("have.length", 2);

      H.openVizSettingsSidebar();
      H.leftSidebar().within(() => {
        cy.findByText("Display").click();
        cy.findByText("Stack series").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "stack_series_enabled",
        triggered_from: "viz_settings",
      });

      H.echartsContainer().within(() => {
        cy.findByText("60,000").should("be.visible");
        cy.findByText("8").should("be.visible");
      });

      H.splitPanelSeparators().should("have.length", 1);

      H.cartesianChartCircleWithColor("#88BF4D");
      H.cartesianChartCircleWithColor("#A989C5");

      // Change series color while split panels are active
      H.leftSidebar().findByText("Data").click();
      H.openSeriesSettings("Sum of Total");

      H.popover().within(() => {
        cy.findByTestId("color-selector-button").button().click();
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

      H.popover().within(() => {
        cy.findByText("Formatting").click();
        cy.findByPlaceholderText("$").type("$").blur();
      });

      H.leftSidebar().within(() => {
        cy.button("Done").click();
      });

      H.echartsContainer().findByText("$60,000").should("be.visible");

      // Tooltip
      H.cartesianChartCircle().first().trigger("mousemove");
      H.assertEChartsTooltip({
        rows: [
          { name: "Sum of Total", value: "$52.76" },
          { name: "Average of Quantity", value: "2" },
        ],
        blurAfter: true,
      });

      // Brush
      cy.findByTestId("query-visualization-root")
        .trigger("mousedown", 180, 200)
        .trigger("mousemove", 180, 200)
        .trigger("mouseup", 400, 200);

      H.chartPathWithFillColor("#EF8C8C").should("be.visible");
      H.cartesianChartCircleWithColor("#A989C5");
    });
  });
});

describe(
  "scenarios > visualizations > line chart (Mongo)",
  { tags: "@mongo" },
  () => {
    function replaceMissingValuesWith(value) {
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
        const questionDetails = {
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
