import { restore, popover } from "__support__/e2e/cypress";

const MONGO_DB_NAME = "QA Mongo4";

describe.skip("issue 16170", () => {
  beforeEach(() => {
    restore("mongo-4");
    cy.signInAsAdmin();

    cy.visit("/question/new");
    cy.findByText("Simple question").click();
    cy.findByText(MONGO_DB_NAME).click();
    cy.findByText("Orders").click();
  });

  it("should correctly replace only the missing values with zero (metabase#16170)", () => {
    cy.findAllByRole("button").contains("Summarize").click();

    cy.findByTestId("sidebar-right").findByText("Created At").click();

    assertOnTheYAxis();

    cy.findByTestId("viz-settings-button").click();

    cy.findByTestId("sidebar-left").findByText("Linear Interpolated").click();

    popover().findByText("Zero").click();

    assertOnTheYAxis();
  });
});

function assertOnTheYAxis() {
  cy.get(".y-axis-label").findByText("Count");
  cy.get(".axis.y .tick").should("have.length.gt", 10).and("contain", "200");
}
