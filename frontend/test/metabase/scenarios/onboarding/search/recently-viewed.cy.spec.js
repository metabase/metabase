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
    cy.findByText("Product ID");

    // inside the "Orders in a dashboard" dashboard, the order is queried again,
    // which elicits a ViewLog entry

    cy.visit("/");

    cy.findByPlaceholderText("Search…").click();
    cy.findByTestId("loading-spinner").should("not.exist");

    assertRecentlyViewedItem(0, "Orders", "Question", "/question/1-orders");
    assertRecentlyViewedItem(
      1,
      "Orders in a dashboard",
      "Dashboard",
      "/dashboard/1-orders-in-a-dashboard",
    );
    assertRecentlyViewedItem(2, "People", "Table", "/question#?db=1&table=3");
  });
});

const assertRecentlyViewedItem = (index, title, type, link) => {
  cy.findAllByTestId("recently-viewed-item")
    .eq(index)
    .parent()
    .should("have.attr", "href", link);

  cy.findAllByTestId("recently-viewed-item-title")
    .eq(index)
    .should("have.text", title);
  cy.findAllByTestId("recently-viewed-item-type")
    .eq(index)
    .should("have.text", type);
};
