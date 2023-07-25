import {
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  modal,
  resetSnowplow,
  restore,
} from "e2e/support/helpers";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const typeFilters = [
  {
    label: "Question",
    sidebarLabel: "Questions",
    filterName: "card",
    resultInfoText: "Saved question in",
  },
  {
    label: "Dashboard",
    sidebarLabel: "Dashboards",
    filterName: "dashboard",
    resultInfoText: "Dashboard in",
  },
];

describe("scenarios > search", () => {
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

  describe("applying search filters", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should render search without filters", () => {});
    it("should hydrate search with search text", () => {});
    it("should not render full page search unless search text is present", () => {});
    it("should render full page search when search text is present and user clicks 'Enter'", () => {});

    typeFilters.forEach(
      ({ label, sidebarLabel, filterName, resultInfoText }) => {
        it(`should filter results by ${label}`, () => {
          cy.visit("/");

          cy.findByTestId("search-bar-filter-button").click();

          modal().within(() => {
            cy.findByText(label).click();
            cy.findByText("Apply all filters").click();
          });

          cy.intercept("GET", "/api/search?q=*").as("search");

          cy.findByPlaceholderText("Search…").clear().type("e{enter}");

          cy.url().should("include", `type=${filterName}`);

          cy.wait("@search").then(({ request }) => {
            expect(request.query.models).to.eq(filterName);
          });

          cy.findAllByTestId("result-link-text-container").each(result => {
            cy.wrap(result).should("contain.text", resultInfoText);
          });

          cy.findAllByTestId("type-sidebar-item").should("have.length", 2);
          cy.findByTestId("type-sidebar").within(() => {
            cy.findByText(sidebarLabel).should("exist");
          });
        });

        it(`should populate filters when type=${filterName} is in the URL`, () => {
          cy.visit(`/search?q=order&type=${filterName}`);

          cy.intercept("GET", "/api/search?q=*").as("search");

          cy.wait("@search").then(({ request }) => {
            expect(request.query.models).to.eq(filterName);
          });

          cy.findAllByTestId("type-sidebar-item").should("have.length", 2);
          cy.findByTestId("type-sidebar").within(() => {
            cy.findByText(sidebarLabel).should("exist");
          });

          cy.findAllByTestId("result-link-text-container").each(result => {
            cy.wrap(result).should("contain.text", resultInfoText);
          });

          cy.findByTestId("highlighted-search-bar-filter-button").click();

          cy.findByTestId("type-filter-checkbox-group").within(() => {
            cy.findAllByRole("checkbox")
              .filter(":checked")
              .should("have.length", 1)
              .and("have.value", filterName);
          });
        });
      },
    );

    it("should not filter results when `Clear all filters` is applied", () => {
      cy.visit("/search?q=order&type=card");

      cy.findAllByTestId("search-result-item-name");
      cy.findByTestId("highlighted-search-bar-filter-button").click();

      modal().within(() => {
        cy.findByText("Clear all filters").click();
      });

      cy.intercept("GET", "/api/search*").as("search");

      cy.findByPlaceholderText("Search…").clear().type("e{enter}");

      cy.wait("@search").then(({ request }) => {
        expect(request.query.models).to.be.undefined;
      });

      cy.findAllByTestId("type-sidebar-item").should("have.length.gt", 2);
    });
  });
});

describeWithSnowplow("scenarios > search", () => {
  const PAGE_VIEW_EVENT = 1;

  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should send snowplow events for global search queries", () => {
    cy.visit("/");
    expectGoodSnowplowEvents(PAGE_VIEW_EVENT);
    cy.findByPlaceholderText("Search…").type("Orders").blur();
    expectGoodSnowplowEvents(PAGE_VIEW_EVENT + 1); // new_search_query
  });
});

function getProductsSearchResults() {
  cy.findByText("Products");
  // This part about the description reproduces metabase#20018
  cy.findByText(
    "Includes a catalog of all the products ever sold by the famed Sample Company.",
  );
}
