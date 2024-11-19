import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertEChartsTooltip,
  chartPathWithFillColor,
  createQuestionAndDashboard,
  echartsContainer,
  getDraggableElements,
  getNotebookStep,
  leftSidebar,
  main,
  moveDnDKitElement,
  openNotebook,
  pieSlices,
  popover,
  restore,
  tableHeaderClick,
  visitDashboard,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID, ORDERS_ID, ORDERS, PEOPLE } = SAMPLE_DATABASE;

const testQuery = {
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  database: SAMPLE_DB_ID,
};

const twoRingQuery = {
  database: 1,
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "day-of-week" },
      ],
      [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
      ],
    ],
  },
};

const threeRingQuery = {
  database: 1,
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "year" },
      ],
      [
        "field",
        PEOPLE.SOURCE,
        { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
      ],
      [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
      ],
    ],
  },
};

describe("scenarios > visualizations > pie chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should render a pie chart (metabase#12506) (#35244)", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "pie",
    });

    ensurePieChartRendered(
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
      null,
      null,
      200,
    );

    // chart should be centered (#48123)
    cy.findByTestId("chart-legend").then(([legend]) => {
      const legendWidth = legend.getBoundingClientRect().width;

      cy.findByTestId("chart-legend-spacer").then(([spacer]) => {
        const spacerWidth = spacer.getBoundingClientRect().width;

        expect(legendWidth).to.be.equal(spacerWidth);
      });
    });

    cy.log("#35244");
    cy.findByLabelText("Switch to data").click();
    tableHeaderClick("Count");
    popover().within(() => {
      cy.findByRole("img", { name: /filter/ }).should("exist");
      cy.findByRole("img", { name: /gear/ }).should("not.exist");
      cy.findByRole("img", { name: /eye_crossed_out/ }).should("not.exist");
    });
  });

  it("should mute items in legend when hovering (metabase#29224)", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "pie",
    });

    cy.findByTestId("chart-legend").findByText("Doohickey").realHover();
    [
      ["Doohickey", "true"],
      ["Gadget", "false"],
      ["Gizmo", "false"],
      ["Widget", "false"],
    ].map(args => checkLegendItemAriaCurrent(args[0], args[1]));
  });

  it("should not truncate legend titles when enabling percentages (metabase#48207)", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "pie",
      visualization_settings: {
        "pie.percent_visibility": "off",
      },
    });

    cy.findByTestId("viz-settings-button").click();

    leftSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByText("In legend").click();
    });

    cy.findByTestId("chart-legend").within(() => {
      cy.findByText("Widget").then(([element]) => {
        // When text is truncated, offsetWidth will be less than scrollWidth
        expect(element.offsetWidth).to.eq(element.scrollWidth);
      });
    });
  });

  it("should instantly toggle the total after changing the setting", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "pie",
    });

    cy.findByTestId("viz-settings-button").click();

    leftSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByText("Show total").click();
    });

    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("TOTAL").should("not.exist");
    });

    leftSidebar().within(() => {
      cy.findByText("Show total").click();
    });

    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("TOTAL").should("be.visible");
    });
  });

  // Skipping since the mousemove trigger flakes too often, and there's already a loki
  // test to cover truncation
  it.skip("should truncate the center dimension label if it overflows", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          expressions: {
            category_foo: [
              "concat",
              ["field", PRODUCTS.CATEGORY, null],
              " the quick brown fox jumps over the lazy dog",
            ],
          },
          aggregation: [["count"]],
          breakout: [["expression", "category_foo"]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pie",
    });

    chartPathWithFillColor("#A989C5").as("slice");
    cy.get("@slice").trigger("mousemove");

    cy.findByTestId("query-visualization-root")
      .findByText("WIDGET THE QUICK BROWN FOX JUMP…")
      .should("be.visible");
  });

  it("should add new slices to the chart if they appear in the query result", () => {
    visitQuestionAdhoc({
      dataset_query: getLimitedQuery(testQuery, 2),
      display: "pie",
    });

    ensurePieChartRendered(["Gadget", "Doohickey"]);

    changeRowLimit(2, 4);

    ensurePieChartRendered(["Widget", "Gadget", "Gizmo", "Doohickey"]);
  });

  it("should preserve a slice's settings if its row is removed then reappears in the query result", () => {
    visitQuestionAdhoc({
      dataset_query: getLimitedQuery(testQuery, 4),
      display: "pie",
    });

    ensurePieChartRendered(["Widget", "Gadget", "Gizmo", "Doohickey"]);

    cy.findByTestId("viz-settings-button").click();

    // Open color picker
    cy.findByLabelText("#F2A86F").click();

    popover().within(() => {
      // Change color
      cy.findByLabelText("#509EE3").click();
    });

    cy.findByTestId("Widget-settings-button").click();

    cy.findByDisplayValue("Widget").type("{selectall}Woooget").realPress("Tab");

    moveDnDKitElement(getDraggableElements().contains("Woooget"), {
      vertical: 100,
    });

    ensurePieChartRendered(["Woooget", "Gadget", "Gizmo", "Doohickey"]);
    chartPathWithFillColor("#509EE3").should("be.visible");

    cy.findByTestId("chart-legend").within(() => {
      cy.get("li").eq(2).contains("Woooget");
    });

    changeRowLimit(4, 2);
    ensurePieChartRendered(["Gadget", "Doohickey"]);

    // Ensure row settings should show only two rows
    cy.findByTestId("viz-settings-button").click();
    getDraggableElements().should("have.length", 2);
    getDraggableElements().contains("Woooget").should("not.exist");
    getDraggableElements().contains("Gizmo").should("not.exist");

    cy.findByTestId("Gadget-settings-button").click();
    cy.findByDisplayValue("Gadget").type("{selectall}Katget").realPress("Tab");
    moveDnDKitElement(getDraggableElements().contains("Katget"), {
      vertical: 30,
    });

    changeRowLimit(2, 4);
    ensurePieChartRendered(["Doohickey", "Katget", "Gizmo", "Woooget"]);

    cy.findByTestId("chart-legend").findByText("Woooget").realHover();
    chartPathWithFillColor("#509EE3").should("be.visible");

    cy.findByTestId("chart-legend").within(() => {
      cy.get("li").eq(1).contains("Katget");
      cy.get("li").eq(3).contains("Woooget");
    });
  });

  it("should automatically map dimension columns in query to rings", () => {
    visitQuestionAdhoc({
      dataset_query: twoRingQuery,
      display: "pie",
    });

    ensurePieChartRendered(
      [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
    );
  });

  it("should allow the user to edit rings", () => {
    visitQuestionAdhoc({
      dataset_query: threeRingQuery,
      display: "pie",
      visualization_settings: {
        "pie.slice_threshold": 0,
      },
    });

    ensurePieChartRendered(
      ["2022", "2023", "2024", "2025", "2026"],
      ["Affiliate", "Facebook", "Google", "Organic", "Twitter"],
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
    );

    cy.findByTestId("viz-settings-button").click();

    cy.findAllByTestId("chartsettings-field-picker")
      .last()
      .within(() => {
        cy.icon("close").click();
      });

    ensurePieChartRendered(
      ["2022", "2023", "2024", "2025", "2026"],
      ["Affiliate", "Facebook", "Google", "Organic", "Twitter"],
    );

    cy.findAllByTestId("chartsettings-field-picker")
      .last()
      .within(() => {
        cy.icon("chevrondown").click();
      });

    cy.get("[data-element-id=list-section]").last().click();

    ensurePieChartRendered(
      ["2022", "2023", "2024", "2025", "2026"],
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
    );

    leftSidebar().within(() => {
      cy.findByText("Add Ring").click();
    });

    cy.get("[data-element-id=list-section]").last().click();

    ensurePieChartRendered(
      ["2022", "2023", "2024", "2025", "2026"],
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
      ["Affiliate", "Facebook", "Google", "Organic", "Twitter"],
    );
  });

  it("should handle hover and drill throughs correctly", () => {
    visitQuestionAdhoc({
      dataset_query: twoRingQuery,
      display: "pie",
      visualization_settings: {
        "pie.slice_threshold": 0,
      },
    });

    ensurePieChartRendered(
      [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
    );

    echartsContainer().within(() => {
      cy.findByText("Saturday").as("saturdaySlice").trigger("mousemove");
    });

    assertEChartsTooltip({
      header: "Created At: Day of week",
      rows: [
        {
          color: "#51528D",
          name: "Saturday",
          value: "2,747",
          secondaryValue: "14.64 %",
        },
        {
          color: "#ED8535",
          name: "Thursday",
          value: "2,698",
          secondaryValue: "14.38 %",
        },
        {
          color: "#E75454",
          name: "Tuesday",
          value: "2,695",
          secondaryValue: "14.37 %",
        },
        {
          color: "#689636",
          name: "Sunday",
          value: "2,671",
          secondaryValue: "14.24 %",
        },
        {
          color: "#8A5EB0",
          name: "Monday",
          value: "2,664",
          secondaryValue: "14.20 %",
        },
        {
          color: "#69C8C8",
          name: "Friday",
          value: "2,662",
          secondaryValue: "14.19 %",
        },
        {
          color: "#F7C41F",
          name: "Wednesday",
          value: "2,623",
          secondaryValue: "13.98 %",
        },
      ],
    });

    cy.get("@saturdaySlice").click({ force: true });

    popover().within(() => {
      cy.findByText("=").click();
    });

    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Count is equal to 2747").should("be.visible");
    });

    cy.go("back");

    ensurePieChartRendered(
      [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      ["Doohickey", "Gadget", "Gizmo", "Widget"],
    );

    echartsContainer().within(() => {
      cy.findAllByText("Doohickey")
        .first()
        .as("doohickeySlice")
        .trigger("mousemove");
    });

    assertEChartsTooltip({
      header: "Saturday",
      rows: [
        {
          name: "Doohickey",
          value: "606",
          secondaryValue: "22.06 %",
        },
        {
          name: "Gadget",
          value: "740",
          secondaryValue: "26.94 %",
        },
        {
          name: "Gizmo",
          value: "640",
          secondaryValue: "23.30 %",
        },
        {
          name: "Widget",
          value: "761",
          secondaryValue: "27.70 %",
        },
      ],
    });

    cy.get("@doohickeySlice").click({ force: true });

    popover().within(() => {
      cy.findByText("=").click();
    });

    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Count is equal to 606").should("be.visible");
    });
  });

  it("should handle click behavior correctly", () => {
    createQuestionAndDashboard({
      questionDetails: {
        query: threeRingQuery.query,
        display: "pie",
        visualization_settings: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "question/{{count}}",
          },
        },
      },
      cardDetails: {
        size_x: 30,
        size_y: 15,
      },
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    confirmSliceClickBehavior("2025", 6578);
    confirmSliceClickBehavior("Affiliate", 1270, 0);
    confirmSliceClickBehavior("Doohickey", 282, 0);

    confirmSliceClickBehavior("2024", 5834);
    confirmSliceClickBehavior("Organic", 1180, 1);
    confirmSliceClickBehavior("Gizmo", 354, 8);
  });

  it("should handle min percentage setting correctly", () => {
    createQuestionAndDashboard({
      questionDetails: {
        query: threeRingQuery.query,
        display: "pie",
        visualization_settings: {
          "pie.slice_threshold": 20.6,
          "pie.percent_visibility": "inside",
          "pie.show_labels": false,
        },
      },
      cardDetails: {
        size_x: 30,
        size_y: 15,
      },
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    // Other slice percentage
    echartsContainer().findByText("79%").realHover();

    assertEChartsTooltip({
      header: "2024",
      rows: [
        {
          name: "Affiliate",
          value: "1,046",
          secondaryValue: "22.68 %",
        },
        {
          name: "Google",
          value: "1,195",
          secondaryValue: "25.92 %",
        },
        {
          name: "Organic",
          value: "1,180",
          secondaryValue: "25.59 %",
        },
        {
          name: "Twitter",
          value: "1,190",
          secondaryValue: "25.81 %",
        },
        {
          name: "Total",
          value: "4,611",
          secondaryValue: "100 %",
        },
      ],
    });
  });
});

function ensurePieChartRendered(rows, middleRows, outerRows, totalValue) {
  cy.findByTestId("query-visualization-root").within(() => {
    // detail
    if (totalValue != null) {
      cy.findByText("TOTAL").should("be.visible");
      cy.findByText(totalValue).should("be.visible");
    }

    // slices
    let rowCount = rows.length;
    const hasMiddleRows = middleRows != null && middleRows.length > 0;
    const hasOuterRows = outerRows != null && outerRows.length > 0;

    if (hasMiddleRows) {
      rowCount += rows.length * middleRows.length;
    }
    if (hasMiddleRows && hasOuterRows) {
      rowCount += rows.length * middleRows.length * outerRows.length;
    }
    pieSlices().should("have.length", rowCount);

    // legend
    rows.forEach((name, i) => {
      cy.findAllByTestId("legend-item").contains(name).should("be.visible");
    });
  });
}

function checkLegendItemAriaCurrent(title, value) {
  cy.findByTestId("chart-legend")
    .findByTestId(`legend-item-${title}`)
    .should("have.attr", "aria-current", value);
}

function getLimitedQuery(query, limit) {
  return {
    ...query,
    query: {
      ...query.query,
      limit,
    },
  };
}

function changeRowLimit(from, to) {
  openNotebook();
  getNotebookStep("limit").within(() => {
    cy.findByDisplayValue(String(from))
      .type(`{selectall}${String(to)}`)
      .realPress("Tab");
  });

  visualize();
}

function confirmSliceClickBehavior(sliceLabel, value, elementIndex) {
  echartsContainer().within(() => {
    if (elementIndex == null) {
      cy.findByText(sliceLabel).click({ force: true });
    } else {
      cy.findAllByText(sliceLabel).eq(elementIndex).click({ force: true });
    }
  });

  cy.location("pathname").should("eq", `/question/${value}`);
  main().within(() => {
    cy.findByText("We're a little lost...");
  });
  cy.go("back");
}
