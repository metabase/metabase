const { H } = cy;
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 43075", () => {
  const questionDetails: StructuredQuestionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
  };

  beforeEach(() => {
    cy.viewport(1000, 300);

    H.restore();
    cy.signInAsAdmin();

    H.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("the breakout popover should fit within the window (metabase#43075)", () => {
    cy.findAllByTestId("cell-data").contains("54").click();
    H.popover().findByText("Break out by…").click();
    H.popover().findByText("Category").click();

    cy.window().then((win) => {
      expect(win.document.documentElement.scrollHeight).to.be.lte(
        win.document.documentElement.offsetHeight,
      );
    });
  });
});

describe("issue 41133", () => {
  const questionDetails: StructuredQuestionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  beforeEach(() => {
    cy.viewport(600, 400);
    H.restore();
    cy.signInAsAdmin();
    H.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("object detail view should be scrollable on narrow screens (metabase#41133)", () => {
    H.openObjectDetail(0);

    H.modal().within(() => {
      cy.findByText("Created At").scrollIntoView().should("be.visible");
      cy.findByText("is connected to:").scrollIntoView().should("be.visible");
    });
  });
});

describe("issue 45255", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "select 'foo' step, 10 v union all select 'baz', 8 union all select null, 6 union all select 'bar', 4",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "funnel",
    });
  });

  it("should work on native queries with null dimension values (metabase#45255)", () => {
    H.openVizSettingsSidebar();

    // Has (empty) in the settings sidebar
    H.sidebar().findByText("(empty)");

    // Can reorder (empty)
    H.getDraggableElements().eq(2).should("have.text", "(empty)");
    H.getDraggableElements().first().as("dragElement");
    H.moveDnDKitElementByAlias("@dragElement", { vertical: 100 });
    H.getDraggableElements().eq(1).should("have.text", "(empty)");

    // Has (empty) in the chart
    cy.findByTestId("funnel-chart").findByText("(empty)");
  });
});

describe("issue 49874, 48847", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("when two axis should show only one related to the hovered series", () => {
    const question = {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.QUANTITY, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        database: 1,
      },
      display: "bar",
    };

    H.visitQuestionAdhoc(question);

    H.echartsContainer().within(() => {
      cy.findByText("Sum of Quantity").should("be.visible");
      cy.findByText("Sum of Total").should("be.visible");
    });

    H.chartGridLines().should("exist");

    H.chartPathWithFillColor("#88BF4D").first().realHover();

    H.echartsContainer().within(() => {
      cy.findByText("Sum of Quantity").should("be.visible");
      cy.findByText("Sum of Total").should("not.exist");
    });
    H.chartGridLines().should("exist");

    H.chartPathWithFillColor("#98D9D9").first().realHover();

    H.echartsContainer().within(() => {
      cy.findByText("Sum of Quantity").should("not.exist");
      cy.findByText("Sum of Total").should("be.visible");
    });
    H.chartGridLines().should("exist");
  });
});

describe("issue 49529", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow selecting breakout dimension before metrics", () => {
    const question = {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
        },
        database: 1,
      },
      display: "bar",
    };

    H.visitQuestionAdhoc(question);

    H.openVizSettingsSidebar();

    cy.findAllByTestId("chart-setting-select")
      .eq(0)
      .as("dimensionSelect")
      .click();
    H.popover().findByText("ID").click();

    H.leftSidebar().findByText("Add series breakout").click();
    H.popover().findByText("Quantity").click();

    H.leftSidebar().within(() => {
      cy.findByText("Y-axis");
      cy.findByText("Nothing to order");
    });
  });
});

describe("issue 47847", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show chart tooltip on narrow ordinal line charts", () => {
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
      header: "April 24–30, 2022",
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
});

describe("issue 51926", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should render pivot table when selecting it from another viz type", () => {
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
      display: "pivot",
    });

    H.openVizTypeSidebar();
    H.leftSidebar().within(() => {
      cy.findByTestId("Table-button").click();
      cy.findByTestId("Pivot Table-button").click();
    });

    cy.findAllByTestId("pivot-table-cell").contains("April 24, 2022");
  });
});

describe("issue 51952", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow changing column settings for the x-axis column", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {},
    });

    H.openVizSettingsSidebar();

    cy.findByTestId("settings-CREATED_AT").click();
    H.popover().findByText("Abbreviate days and months").click();
    H.echartsContainer().findByText("Jan 2024");
  });
});

describe("issue 55880", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should render scatter plot with native query data", () => {
    H.visitQuestionAdhoc({
      visualization_settings: {
        "graph.dimensions": ["X"],
        "graph.metrics": ["Y"],
      },
      dataset_query: {
        type: "native",
        native: {
          query: `select * from (
  select 1415 x, 1 y
  union all select 20, 2
  union all select 900, 3
  union all select 115, 4
) as subquery
where x < {{param}}`,
          "template-tags": {
            param: {
              type: "number",
              name: "param",
              id: "144103a1-ebd4-4477-a7fa-f08cfd808d5e",
              "display-name": "Param",
              required: true,
              default: "30",
            },
          },
        },
        database: SAMPLE_DB_ID,
      },
      display: "scatter",
    });

    // Renders a scatter chart with numeric x-axis
    H.chartPathWithFillColor("#88BF4D").should("have.length", 1);
    H.echartsContainer().findByText("20");

    H.saveQuestion("55880");

    // Change filter value so values include numbers that can be parsed as valid dates
    cy.findByPlaceholderText("Param").clear().type("1500");
    H.runNativeQuery();

    // Still renders a scatter chart with numeric x-axis
    H.echartsContainer().findByText("1,500");
    H.chartPathWithFillColor("#88BF4D").should("have.length", 4);
  });
});

describe("issue 47757", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show correct tooltips for interpolated data points (metabase#47757)", () => {
    H.visitQuestionAdhoc({
      visualization_settings: {
        "graph.dimensions": ["X"],
        "graph.metrics": ["Y"],
        series_settings: { Y: { "line.missing": "zero" } },
      },
      dataset_query: {
        type: "native",
        native: {
          query: `select '2020-01-01' x, 10 y
union all select '2020-03-01' x, 30 y
union all select '2020-04-01' x, 40 y`,
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    H.cartesianChartCircleWithColor("#88BF4D").eq(0).trigger("mousemove");
    H.assertEChartsTooltip({
      header: "January 2020",
      rows: [
        {
          color: "#88BF4D",
          name: "Y",
          value: 10,
        },
      ],
      footer: null,
      blurAfter: true,
    });

    H.cartesianChartCircleWithColor("#88BF4D").eq(1).trigger("mousemove");
    H.assertEChartsTooltip({
      header: "February 2020",
      rows: [
        {
          color: "#88BF4D",
          name: "Y",
          value: 0,
          secondaryValue: "-100%",
        },
      ],
      footer: null,
      blurAfter: true,
    });

    H.cartesianChartCircleWithColor("#88BF4D").eq(2).trigger("mousemove");
    H.assertEChartsTooltip({
      header: "March 2020",
      rows: [
        {
          color: "#88BF4D",
          name: "Y",
          value: 30,
          secondaryValue: "+∞%",
        },
      ],
      footer: null,
      blurAfter: true,
    });
  });
});

describe("issue 59671", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not crash when removing dimension aggregation column from the query (metabase#59671)", () => {
    const questionDetails: StructuredQuestionDetails = {
      display: "line" as const,
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
  });
});

describe("issue 59830", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not crash when saved dimension settings refer to a non-existent column (metabase#59830)", () => {
    const questionDetails: StructuredQuestionDetails = {
      display: "line" as const,
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
    cy.findByTestId("visualization-placeholder").should("be.visible");
  });
});

describe("issue 54755", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show an empty state when no dimensions are available (metabase#54755)", () => {
    const questionDetails: StructuredQuestionDetails = {
      display: "line" as const,
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
});

describe("issue 63026", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show tooltips with reasonable width for pie charts with long text labels (metabase#63026)", () => {
    const query = `select '${"a".repeat(1000)}' as category, 45 as count
union all select 'Short name', 25 as count
union all select 'Medium length category', 30 as count`;

    H.visitQuestionAdhoc({
      display: "pie",
      dataset_query: {
        type: "native",
        native: {
          query,
        },
        database: SAMPLE_DB_ID,
      },
      visualization_settings: {
        "pie.show_labels": true,
      },
    });

    H.chartPathWithFillColor("#88BF4D").trigger("mousemove");

    cy.get("[data-testid='echarts-tooltip']")
      .should("be.visible")
      .then(($tooltip) => {
        const width = $tooltip.width();
        expect(width).to.be.lte(550);
      });
  });
});

describe("issue 55853", () => {
  const questionDetails = {
    name: "55853",
    database: WRITABLE_DB_ID,
    native: {
      query: `select 'Category A' as category, 0.0001 as value union all
        select 'Category B' as category, 0.0002 as value union all
        select 'Category C' as category, 0.00015 as value union all
        select 'Category D' as category, 0.00025 as value`,
      "template-tags": {},
    },
    display: "bar",
    visualization_settings: {
      "graph.dimensions": ["category"],
      "graph.metrics": ["value"],
      column_settings: {
        '["name","value"]': {
          number_style: "percent",
        },
      },
    },
  };

  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should not have y-axis labels colliding with very low percentages (metabase#55853)", () => {
    H.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.log("Verify that the chart renders successfully");
    H.echartsContainer().should("be.visible");
    H.echartsContainer().get("text").should("contain", "%");
    H.chartPathWithFillColor("#88BF4D").should("have.length", 4);

    cy.log("Check that axis labels and title don't overlap");
    H.echartsContainer()
      .get("text")
      .then(($texts) => {
        const percentTexts: Array<{ text: string; element: HTMLElement }> = [];
        const axisTitle: Array<{ text: string; element: HTMLElement }> = [];

        $texts.each((i, el) => {
          const text = (el as HTMLElement).textContent?.trim() || "";
          if (text.includes("%") && text !== "value") {
            percentTexts.push({ text, element: el as HTMLElement });
          }
          if (text === "value") {
            axisTitle.push({ text, element: el as HTMLElement });
          }
        });

        cy.log("Verify we have percentage labels");
        expect(percentTexts.length).to.be.greaterThan(0);

        cy.log("Check that axis labels and title don't overlap");
        if (axisTitle.length > 0 && percentTexts.length > 0) {
          const titleRect = axisTitle[0].element.getBoundingClientRect();

          percentTexts.forEach(({ text, element }) => {
            const labelRect = element.getBoundingClientRect();

            expect(
              labelRect.left - titleRect.right,
              `Label "${text}" should not overlap with axis title "${axisTitle[0].text}"`,
            ).to.be.greaterThan(5);
          });
        }
      });

    cy.log(
      "Verify tooltips show correct percentage values (not incorrectly rounded)",
    );
    H.chartPathWithFillColor("#88BF4D").first().realHover();
    H.assertEChartsTooltip({
      header: "Category A",
      rows: [
        {
          name: "value",
          value: "0.01%",
        },
      ],
    });
  });
});

describe("issue 10493", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should display bar chart for binned column distribution after applying filter (metabase#10493)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
        },
        database: SAMPLE_DB_ID,
      },
    });

    cy.log("Click on Quantity column header and select Distribution");
    H.tableHeaderClick("Quantity");
    H.popover().findByText("Distribution").click();

    cy.log("Verify bar chart is displayed with binned quantity as dimension");
    cy.findByTestId("visualization-root").should(
      "have.attr",
      "data-viz-ui-name",
      "Bar",
    );
    H.echartsContainer().should("be.visible");
    H.chartPathWithFillColor("#509EE3").should("exist");

    cy.log("Apply filter: count >= 20");
    cy.findByTestId("qb-header-action-panel").findByText("Filter").click();
    H.popover().within(() => {
      cy.findByText("Summaries").click();
      cy.findByText("Count").click();
    });
    H.selectFilterOperator("Greater than or equal to");
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("20");
      cy.button("Apply filter").click();
    });

    cy.wait("@dataset");

    cy.log(
      "Verify bar chart is still displayed (binned column should still be treated as dimension)",
    );
    cy.findByTestId("query-builder-main")
      .findByText(/^Doing science/)
      .should("not.exist");
    cy.findByTestId("visualization-placeholder").should("not.exist");
    cy.findByTestId("visualization-root").should(
      "have.attr",
      "data-viz-ui-name",
      "Bar",
    );
    H.echartsContainer().should("be.visible");
    H.chartPathWithFillColor("#509EE3").should("exist");
  });
});

describe("UXW-2696", () => {
  const getChartPoints = () =>
    H.echartsContainer().get("path[fill='hsla(0, 0%, 100%, 1.00)']");
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
    H.restore();
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
    cy.get<number>("@questionId").then((id) => H.visitQuestion(id));

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

  it("should show the message on pinned cards", () => {
    H.visitCollection("root");
    H.openCollectionItemMenu(QUESTION_NAME);
    H.popover().findByText("Pin this").click();

    H.getPinnedSection().within(() => {
      assertNoPoints();
    });
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
      cy.findByRole("radio", { name: /axes/i }).click({ force: true });
      cy.findByRole("switch", { name: /auto y-axis range/i }).should(
        "not.have.attr",
        "data-checked",
      );

      cy.findByLabelText("Min").clear().type("70");
    });

    H.getDocumentCard(QUESTION_NAME).within(() => {
      assertDataVisible();
    });
  });

  describe("dashcard", () => {
    beforeEach(() => {
      cy.get<number>("@questionId").then((cardId) => {
        H.createDashboard(
          {
            name: "Test Dashboard",
          },
          {
            wrapId: true,
          },
        );

        cy.get<number>("@dashboardId").then((dashboardId) =>
          H.addQuestionToDashboard({ dashboardId, cardId }),
        );
      });
    });

    it("should show you a message on a dashboard", () => {
      cy.get<number>("@dashboardId").then((id) => H.visitDashboard(id));

      cy.findByTestId("dashcard").within(() => {
        assertNoPoints();
      });

      H.editDashboard();
      H.showDashcardVisualizerModalSettings(0, { isVisualizerCard: false });

      H.modal().within(() => {
        cy.findByRole("radio", { name: /axes/i }).click({ force: true });
        cy.findByRole("switch", { name: /auto y-axis range/i }).should(
          "not.have.attr",
          "data-checked",
        );

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
