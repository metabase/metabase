import {
  createAction,
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  popover,
  resetSnowplow,
  restore,
  setActionsEnabledForDB,
} from "e2e/support/helpers";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const typeFilters = [
  {
    label: "Question",
    filterName: "card",
    resultInfoText: "Saved question in",
  },
  {
    label: "Dashboard",
    filterName: "dashboard",
    resultInfoText: "Dashboard in",
  },
  {
    label: "Collection",
    filterName: "collection",
    resultInfoText: "Collection",
  },
  {
    label: "Table",
    filterName: "table",
    resultInfoText: "Table in",
  },
  {
    label: "Database",
    filterName: "database",
    resultInfoText: "Database",
  },
  {
    label: "Model",
    filterName: "dataset",
    resultInfoText: "Model in",
  },
  {
    label: "Action",
    filterName: "action",
  },
];

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > search", () => {
  beforeEach(() => {
    restore();
    cy.intercept("GET", "/api/search?q=*").as("search");
  });

  describe("universal search", () => {
    it("should work for admin (metabase#20018)", () => {
      cy.signInAsAdmin();

      cy.visit("/");
      getSearchBar().as("searchBox").type("product").blur();

      cy.findByTestId("search-results-list").within(() => {
        getProductsSearchResults();
      });

      cy.get("@searchBox").type("{enter}");
      cy.wait("@search");

      cy.findAllByTestId("search-result-item")
        .first()
        .within(() => {
          getProductsSearchResults();
        });
    });

    it("should work for user with permissions (metabase#12332)", () => {
      cy.signInAsNormalUser();
      cy.visit("/");
      getSearchBar().type("product{enter}");
      cy.wait("@search");
      cy.findByTestId("search-app").within(() => {
        cy.findByText("Products");
      });
    });

    it("should work for user without data permissions (metabase#16855)", () => {
      cy.signIn("nodata");
      cy.visit("/");
      getSearchBar().type("product{enter}");
      cy.wait("@search");
      cy.findByTestId("search-app").within(() => {
        cy.findByText("Didn't find anything");
      });
    });

    it("allows to select a search result using keyboard", () => {
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

      setActionsEnabledForDB(SAMPLE_DB_ID);

      cy.createQuestion({
        name: "Orders Model",
        query: { "source-table": ORDERS_ID },
        dataset: true,
      }).then(({ body: { id } }) => {
        createAction({
          name: "Update orders quantity",
          description: "Set orders quantity to the same value",
          type: "query",
          model_id: id,
          database_id: SAMPLE_DB_ID,
          dataset_query: {
            database: SAMPLE_DB_ID,
            native: {
              query: "UPDATE orders SET quantity = quantity",
            },
            type: "native",
          },
          parameters: [],
          visualization_settings: {
            type: "button",
          },
        });
      });
    });

    describe("hydrating search query from URL", () => {
      it("should hydrate search with search text", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");

        getSearchBar().should("have.value", "orders");
        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "orders"').should("exist");
        });
      });

      it("should hydrate search with search text and filter", () => {
        const { filterName, resultInfoText } = typeFilters[0];
        cy.visit(`/search?q=orders&type=${filterName}`);
        cy.wait("@search");

        getSearchBar().should("have.value", "orders");

        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "orders"').should("exist");
        });

        cy.findAllByTestId("result-link-info-text").each(result => {
          cy.wrap(result).should("contain.text", resultInfoText);
        });

        cy.findByTestId("type-search-filter").within(() => {
          cy.findByText("Question").should("exist");
          cy.findByLabelText("close icon").should("exist");
        });
      });
    });

    describe("accessing full page search with `Enter`", () => {
      it("should not render full page search if user has not entered a text query ", () => {
        cy.intercept("GET", "/api/activity/recent_views").as("getRecentViews");

        cy.visit("/");

        getSearchBar().click().type("{enter}");

        cy.wait("@getRecentViews");

        cy.findByTestId("search-results-floating-container").within(() => {
          cy.findByText("Recently viewed").should("exist");
        });
        cy.location("pathname").should("eq", "/");
      });

      it("should render full page search when search text is present and user clicks 'Enter'", () => {
        cy.visit("/");

        getSearchBar().click().type("orders{enter}");
        cy.wait("@search");

        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "orders"').should("exist");
        });

        cy.location().should(loc => {
          expect(loc.pathname).to.eq("/search");
          expect(loc.search).to.eq("?q=orders");
        });
      });
    });

    describe("search filters", () => {
      describe("type filters", () => {
        typeFilters.forEach(({ label, resultInfoText }) => {
          it(`should filter results by ${label}`, () => {
            cy.visit("/");

            getSearchBar().clear().type("e{enter}");
            cy.wait("@search");

            cy.findByTestId("type-search-filter").click();
            popover().within(() => {
              cy.findByText(label).click();
              cy.findByText("Apply filters").click();
            });

            cy.findAllByTestId("result-link-info-text").each(result => {
              if (resultInfoText) {
                cy.wrap(result).should("contain.text", resultInfoText);
              }
            });
          });
        });

        it("should remove type filter when `X` is clicked on search filter", () => {
          const { filterName } = typeFilters[0];
          cy.visit(`/search?q=orders&type=${filterName}`);
          cy.wait("@search");

          cy.findByTestId("type-search-filter").within(() => {
            cy.findByText("Question").should("exist");
            cy.findByLabelText("close icon").click();
            cy.findByText("Question").should("not.exist");
            cy.findByText("Content type").should("exist");
          });

          cy.url().should("not.contain", "type");

          // Check that we're getting elements other than Questions by checking the
          // result text and checking if there's more than one result-link-info-text text
          cy.findAllByTestId("result-link-info-text").then($elements => {
            const textContent = new Set(
              $elements.toArray().map(el => el.textContent),
            );
            expect(textContent.size).to.be.greaterThan(1);
          });
        });
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
