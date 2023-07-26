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
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
  {
    label: "Collection",
    sidebarLabel: "Collections",
    filterName: "collection",
    resultInfoText: "Collection",
  },
  {
    label: "Metric",
    sidebarLabel: "Metrics",
    filterName: "metric",
    resultInfoText: "Metric for",
  },
  {
    label: "Segment",
    sidebarLabel: "Segments",
    filterName: "segment",
    resultInfoText: "Segment of",
  },
  {
    label: "Table",
    sidebarLabel: "Raw Tables",
    filterName: "table",
    resultInfoText: "Table in",
  },
  {
    label: "Database",
    sidebarLabel: "Databases",
    filterName: "database",
    resultInfoText: "Database",
  },
  {
    label: "Model",
    sidebarLabel: "Models",
    filterName: "dataset",
    resultInfoText: "Model in",
  },
];

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("scenarios > search", () => {
  beforeEach(restore);

  describe("universal search", () => {
    it("should work for admin (metabase#20018)", () => {
      cy.signInAsAdmin();

      cy.visit("/");
      getSearchBar().as("searchBox").type("product").blur();

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
      getSearchBar().type("product{enter}");
      cy.findByTestId("search-app").within(() => {
        cy.findByText("Products");
      });
    });

    it("should work for user without data permissions (metabase#16855)", () => {
      cy.signIn("nodata");
      cy.visit("/");
      getSearchBar().type("product{enter}");

      cy.findByTestId("search-app").within(() => {
        cy.findByText("Didn't find anything");
      });
    });

    it("allows to select a search result using keyboard", () => {
      cy.intercept("GET", "/api/search*").as("search");

      cy.signInAsNormalUser();
      cy.visit("/");
      getSearchBar().type("ord");
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

      // I can't seem to get the `before` block working with the `search filters`
      // describe block, so will just do it here for now.
      cy.createSegment({
        name: "Segment",
        description: "All orders with a total under $100.",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      // metric
      cy.createMetric({
        name: "Metric",
        description: "Sum of orders subtotal",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
        },
      });

      cy.createQuestion({
        name: "Orders Model",
        query: { "source-table": ORDERS_ID },
        dataset: true,
      });
    });

    describe("hydrating search query from URL", () => {
      it("should hydrate search with search text", () => {
        cy.visit("/search?q=orders");
        getSearchBar().should("have.value", "orders");
        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "orders"').should("exist");
        });
      });

      it("should hydrate search with search text and filter", () => {
        cy.visit("/search?q=orders&type=card");
        getSearchBar().should("have.value", "orders");
        cy.findByTestId("highlighted-search-bar-filter-button").should("exist");

        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "orders"').should("exist");
        });

        cy.findByTestId("type-sidebar").within(() => {
          cy.findByText("Questions").should("exist");
        });
      });
    });

    describe("accessing full page search with `Enter`", () => {
      it("should not render full page search unless search text is present and user clicks 'Enter'", () => {
        cy.visit("/");
        cy.findByTestId("search-bar-filter-button").click();
        modal().within(() => {
          cy.findByText("Question").click();
          cy.findByText("Apply all filters").click();
        });
        getSearchBar().click().type("{enter}");

        cy.findByTestId("recents-list-header").should("exist");
        cy.location("pathname").should("eq", "/");
      });

      it("should render full page search when search text is present and user clicks 'Enter'", () => {
        cy.visit("/");
        cy.findByTestId("search-bar-filter-button").click();
        modal().within(() => {
          cy.findByText("Question").click();
          cy.findByText("Apply all filters").click();
        });
        getSearchBar().click().type("orders{enter}");

        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "orders"').should("exist");
        });

        cy.location().should(loc => {
          expect(loc.pathname).to.eq("/search");
          expect(loc.search).to.eq("?q=orders&type=card");
        });
      });
    });

    describe("search filters", () => {
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

            getSearchBar().clear().type("e{enter}");

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

        getSearchBar().clear().type("e{enter}");

        cy.wait("@search").then(({ request }) => {
          expect(request.query.models).to.be.undefined;
        });

        // TODO: check if we should be checking for all available models
        // rather than just checking if we need to check for >2 models
        // (i.e. implying that we have no type filters applied)
        cy.findAllByTestId("type-sidebar-item").should("have.length.gt", 2);
      });
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
    getSearchBar().type("Orders").blur();
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

function getSearchBar() {
  return cy.findByPlaceholderText("Search…");
}
