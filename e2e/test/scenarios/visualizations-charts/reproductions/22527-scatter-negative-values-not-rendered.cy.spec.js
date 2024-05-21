import { restore, popover, testPairedTooltipValues } from "e2e/support/helpers";

const questionDetails = {
  native: {
    query:
      "select 1 x, 1 y, 20 size\nunion all  select 2 x, 10 y, 10 size\nunion all  select 3 x, -9 y, 6 size\nunion all  select 4 x, 100 y, 30 size\nunion all  select 5 x, -20 y, 70 size",
  },
  display: "scatter",
  visualization_settings: {
    "graph.dimensions": ["X"],
    "graph.metrics": ["Y"],
  },
};

describe.skip("issue 22527", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("should render negative values in a scatter visualziation (metabase#22527)", () => {
    assertion();

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByTextEnsureVisible("Data").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Bubble size").parent().contains("Select a field").click();

    popover().contains(/size/i).click();

    assertion();
  });
});

function assertion() {
  cy.get("circle").should("have.length", 5).last().realHover();

  popover().within(() => {
    testPairedTooltipValues("X", "5");
    testPairedTooltipValues("Y", "-20");
    testPairedTooltipValues("SIZE", "70");
  });
}
