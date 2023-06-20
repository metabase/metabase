import { restore } from "e2e/support/helpers";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_data";

describe("scenarios > auth > search", () => {
  beforeEach(restore);

  describe("universal search", () => {
    it("should work for admin (metabase#20018)", () => {
      cy.signInAsAdmin();

      cy.visit("/");
      cy.findByPlaceholderText("Search…")
        .as("searchBox")
        .type("product")
        .blur();

      cy.findByTestId("search-results-list").within(() => {
        getProductsSearchResults();
      });

      cy.get("@searchBox").type("{enter}");

      cy.findByTestId("search-result-item").within(() => {
        getProductsSearchResults();
      });
    });

    it("should work for user with permissions (metabase#12332)", () => {
      cy.signInAsNormalUser();
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Products");
    });

    it("should work for user without data permissions (metabase#16855)", () => {
      cy.signIn("nodata");
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Didn't find anything");
    });

    it("allows to select a search result using keyboard", () => {
      cy.intercept("GET", "/api/search*").as("search");

      cy.signInAsNormalUser();
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("ord");
      cy.wait("@search");
      cy.findAllByTestId("search-result-item-name")
        .first()
        .should("have.text", "Orders");

      cy.realPress("ArrowDown");
      cy.realPress("Enter");

      cy.location("pathname").should(
        "eq",
        `/question/${ORDERS_QUESTION_ID}-orders`,
      );
    });
  });
});

function getProductsSearchResults() {
  cy.findByText("Products");
  // This part about the description reproduces metabase#20018
  cy.findByText(
    "Includes a catalog of all the products ever sold by the famed Sample Company.",
  );
}
