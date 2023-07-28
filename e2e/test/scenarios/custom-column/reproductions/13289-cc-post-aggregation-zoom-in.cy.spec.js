import {
  restore,
  openOrdersTable,
  popover,
  enterCustomColumnDetails,
  visualize,
  summarize,
} from "e2e/support/helpers";

const CC_NAME = "Math";
describe("issue 13289", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();

    // Add custom column that will be used later in summarize (group by)
    enterCustomColumnDetails({ formula: "1 + 1", name: CC_NAME });
    cy.button("Done").click();
  });

  it("should allow 'zoom in' drill-through when grouped by custom column (metabase#13289) (metabase#13289)", () => {
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();

    popover().findByText(CC_NAME).click();

    cy.icon("add").last().click();

    popover().within(() => {
      cy.findByText("Created At").click();
    });

    visualize();

    cy.get(".Visualization").within(() => {
      cy.get("circle")
        .eq(5) // random circle in the graph (there is no specific reason for this index)
        .click({ force: true });
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See this month by week").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${CC_NAME} is equal to 2`);
  });
});
