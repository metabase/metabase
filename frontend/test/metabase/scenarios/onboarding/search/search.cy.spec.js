import { restore } from "__support__/e2e/helpers";

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
      cy.findByText("Products");
    });

    it("should work for user without data permissions (metabase#16855)", () => {
      cy.signIn("nodata");
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      cy.findByText("Didn't find anything");
    });

    it("allows select a search result from keyboard", () => {
      cy.intercept("GET", "/api/search*").as("search");

      cy.signInAsNormalUser();
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("ord");
      cy.wait("@search");

      cy.get("body").trigger("keydown", { key: "ArrowDown" });
      cy.get("body").trigger("keydown", { key: "Enter" });

      cy.url().should("match", /\/question\/1-orders$/);
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
