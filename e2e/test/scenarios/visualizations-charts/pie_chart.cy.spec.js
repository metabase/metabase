import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visitQuestionAdhoc,
  popover,
  tableHeaderClick,
  pieSlices,
  leftSidebar,
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
});

function ensurePieChartRendered(rows, totalValue) {
  cy.findByTestId("query-visualization-root").within(() => {
    // detail
    cy.findByText("TOTAL").should("be.visible");
    cy.findByText(totalValue).should("be.visible");

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
