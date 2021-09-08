import { restore } from "__support__/e2e/cypress";

describe(`search > recently viewed`, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shows list of recently viewed items", () => {
    cy.visit("/browse/1-sample-dataset");
    cy.findByText("People").click();

    // "Orders" question
    cy.visit("/question/1");

    // "Orders in a dashboard" dashboard
    cy.visit("/dashboard/1");

    cy.visit("/");

    cy.findByPlaceholderText("Search…").click();
    cy.get(".LoadingSpinner").should("not.exist");

    assertRecentlyViewedItem(0, "Orders in a dashboard", "Dashboard");
    assertRecentlyViewedItem(1, "Orders", "Question");
    assertRecentlyViewedItem(2, "People", "Table");
  });
});

const assertRecentlyViewedItem = (index, title, type) => {
  cy.findAllByTestId("recently-viewed-item-title")
    .eq(index)
    .should("have.text", title);
  cy.findAllByTestId("recently-viewed-item-type")
    .eq(index)
    .should("have.text", type);
};
