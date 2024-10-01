import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  chartPathWithFillColor,
  getDraggableElements,
  getNotebookStep,
  leftSidebar,
  moveDnDKitElement,
  openNotebook,
  pieSlices,
  popover,
  restore,
  tableHeaderClick,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const testQuery = {
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  database: SAMPLE_DB_ID,
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

    ensurePieChartRendered(["Doohickey", "Gadget", "Gizmo", "Widget"], 200);

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
    chartPathWithFillColor("#509EE3").should("be.visible");

    cy.findByTestId("chart-legend").within(() => {
      cy.get("li").eq(1).contains("Katget");
      cy.get("li").eq(3).contains("Woooget");
    });
  });
});

function ensurePieChartRendered(rows, totalValue) {
  cy.findByTestId("query-visualization-root").within(() => {
    // detail
    if (totalValue != null) {
      cy.findByText("TOTAL").should("be.visible");
      cy.findByText(totalValue).should("be.visible");
    }

    // slices
    pieSlices().should("have.length", rows.length);

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
