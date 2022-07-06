import { restore } from "__support__/e2e/helpers";

describe("issue 16938", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow to browse object details when exploring native query results (metabase#16938)", () => {
    const ORDER_ID = 1;

    cy.createNativeQuestion(
      {
        name: "Orders",
        native: {
          query: "select * from orders",
        },
      },
      { visitQuestion: true },
    );

    cy.button(/Explore results/i).click();
    cy.wait("@dataset");

    getFirstTableColumn().eq(1).should("contain", ORDER_ID).click();

    cy.findByTestId("object-detail").within(() => {
      cy.findByText("37.65");
    });
  });
});

function getFirstTableColumn() {
  return cy.get(".TableInteractive-cellWrapper--firstColumn");
}
