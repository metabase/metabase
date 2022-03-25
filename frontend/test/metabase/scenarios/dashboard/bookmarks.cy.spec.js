import { restore, sidebar, visitDashboard } from "__support__/e2e/cypress";

describe("scenarios > dashboard > bookmarks", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add and then remove bookmark", () => {
    visitDashboard(1);

    cy.icon("ellipsis").click();

    cy.findByText("Bookmark").click();

    cy.visit("/collection/root");

    sidebar().within(() => {
      // Find the bookmark and click on it to visit dashboard page again
      cy.findByText("Orders in a dashboard").click();
    });

    cy.icon("ellipsis").click();

    cy.findByText("Remove bookmark").click();

    cy.intercept("GET", "/api/collection/root/items?**").as(
      "fetchRootCollectionItems",
    );

    cy.visit("/collection/root");

    cy.wait("@fetchRootCollectionItems");

    sidebar().within(() => {
      cy.findByText("Orders in a dashboard").should("not.exist");
    });
  });
});
