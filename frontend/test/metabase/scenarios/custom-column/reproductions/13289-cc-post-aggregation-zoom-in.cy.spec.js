import {
  restore,
  openOrdersTable,
  popover,
  enterCustomColumnDetails,
  visualize,
} from "__support__/e2e/cypress";

const CC_NAME = "Math";
describe("issue 13289", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    openOrdersTable({ mode: "notebook" });

    cy.findByText("Custom column").click();

    // Add custom column that will be used later in summarize (group by)
    enterCustomColumnDetails({ formula: "1 + 1", name: CC_NAME });
    cy.button("Done").click();
  });

  it("should allow 'zoom in' drill-through when grouped by custom column (metabase#13289) (metabase#13289)", () => {
    cy.findByText("Summarize").click();
    cy.findByText("Count of rows").click();

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

    cy.findByText("Zoom in").click();
    cy.wait("@dataset");

    cy.findByText("There was a problem with your question").should("not.exist");

    cy.findByText(`${CC_NAME} is equal to 2`);
  });
});
