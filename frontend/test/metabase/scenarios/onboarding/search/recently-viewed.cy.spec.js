import {
  restore,
  visitQuestion,
  visitDashboard,
} from "__support__/e2e/helpers";

describe(`search > recently viewed`, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.visit("/browse/1-sample-database");

    // "People" table
    cy.findByTextEnsureVisible("People").click();
    cy.wait("@dataset");
    cy.findByTextEnsureVisible("Address");

    // "Orders" question
    visitQuestion(1);

    // "Orders in a dashboard" dashboard
    visitDashboard(1);
    cy.findByTextEnsureVisible("Product ID");

    // inside the "Orders in a dashboard" dashboard, the order is queried again,
    // which elicits a ViewLog entry

    cy.visit("/");
    cy.findByPlaceholderText("Search…").click();
  });

  it("shows list of recently viewed items", () => {
    cy.findByTestId("loading-spinner").should("not.exist");

    assertRecentlyViewedItem(
      0,
      "Orders in a dashboard",
      "Dashboard",
      "/dashboard/1-orders-in-a-dashboard",
    );
    assertRecentlyViewedItem(1, "Orders", "Question", "/question/1-orders");
    assertRecentlyViewedItem(2, "People", "Table", "/question#?db=1&table=3");
  });

  it("allows to select an item from keyboard", () => {
    cy.get("body").trigger("keydown", { key: "ArrowDown" });
    cy.get("body").trigger("keydown", { key: "ArrowDown" });
    cy.get("body").trigger("keydown", { key: "Enter" });

    cy.url().should("match", /\/question\/1-orders$/);
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
