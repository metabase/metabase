import {
  describeEE,
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  restore,
  setTokenFeatures,
} from "e2e/support/helpers";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createMetric,
  createSegment,
} from "e2e/support/helpers/e2e-table-metadata-helpers";

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

  describeEE("applying search filters", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      setTokenFeatures("all");

      createSegment({
        name: "Segment",
        description: "All orders with a total under $100.",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      createMetric({
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

      cy.createModerationReview({
        status: "verified",
        moderated_item_type: "card",
        moderated_item_id: ORDERS_COUNT_QUESTION_ID,
      });
    });

    describe("rendering `Verified` filter", () => {
      it("should render if Pro/EE instance", () => {
        setTokenFeatures("all");
        cy.visit("/");
        cy.findByTestId("search-bar-filter-button").click();
        cy.findByTestId("verified-search-filter").should("exist");
      });
      it("should not render if Starter instance", () => {
        setTokenFeatures("none");
        cy.visit("/");
        cy.findByTestId("search-bar-filter-button").click();
        cy.findByTestId("verified-search-filter").should("not.exist");
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
        const { sidebarLabel, filterName, resultInfoText } = typeFilters[0];
        cy.visit(`/search?q=orders&type=${filterName}`);
        cy.wait("@search");

        getSearchBar().should("have.value", "orders");
        cy.findByTestId("search-bar-filter-button").should(
          "have.attr",
          "data-is-filtered",
          "true",
        );

        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "orders"').should("exist");
        });

        cy.findAllByTestId("type-sidebar-item").should("have.length", 2);
        cy.findByTestId("type-sidebar").within(() => {
          cy.findByText(sidebarLabel).should("exist");
        });
        cy.findAllByTestId("result-link-info-text").each(result => {
          cy.wrap(result).should("contain.text", resultInfoText);
        });
      });
    });

    describe("accessing full page search with `Enter`", () => {
      it("should not render full page search if user has not entered a text query ", () => {
        cy.intercept("GET", "/api/activity/recent_views").as("getRecentViews");

        cy.visit("/");

        cy.findByTestId("search-bar-filter-button").click();
        getSearchModalContainer().within(() => {
          cy.findByText("Question").click();
          cy.findByText("Apply all filters").click();
        });
        getSearchBar().click().type("{enter}");

        cy.wait("@getRecentViews");

        cy.findByTestId("search-results-floating-container").within(() => {
          cy.findByText("Recently viewed").should("exist");
        });
        cy.location("pathname").should("eq", "/");
      });

      it("should render full page search when search text is present and user clicks 'Enter'", () => {
        cy.visit("/");
        cy.findByTestId("search-bar-filter-button").click();
        getSearchModalContainer().within(() => {
          cy.findByText("Question").click();
          cy.findByText("Apply all filters").click();
        });
        getSearchBar().click().type("orders{enter}");
        cy.wait("@search");

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
      describe("type filters", () => {
        typeFilters.forEach(
          ({ label, sidebarLabel, filterName, resultInfoText }) => {
            it(`should filter results by ${label}`, () => {
              cy.visit("/");

              cy.findByTestId("search-bar-filter-button").click();
              getSearchModalContainer().within(() => {
                cy.findByText(label).click();
                cy.findByText("Apply all filters").click();
              });

              getSearchBar().clear().type("e{enter}");
              cy.wait("@search");

              cy.url().should("include", `type=${filterName}`);

              cy.findAllByTestId("result-link-info-text").each(result => {
                cy.wrap(result).should("contain.text", resultInfoText);
              });

              cy.findAllByTestId("type-sidebar-item").should("have.length", 2);
              cy.findByTestId("type-sidebar").within(() => {
                cy.findByText(sidebarLabel).should("exist");
              });
            });
          },
        );
      });

      describe("verified filter", () => {
        it("should filter only for `Verified` assets", () => {
          cy.visit("/");

          cy.findByTestId("search-bar-filter-button").click();
          getSearchModalContainer().within(() => {
            cy.findByText("Only verified items").click();
            cy.findByText("Apply all filters").click();
          });

          getSearchBar().clear().type("Orders{enter}");
          cy.wait("@search");

          cy.url().should("include", `verified=true`);

          const verifiedItem = cy.findByTestId("search-result-item");
          verifiedItem.within(() => {
            cy.findByLabelText("verified icon").should("exist");
          });
        });

        it("should show verified and unverified assets when `All items` is selected", () => {
          cy.visit("/");

          cy.findByTestId("search-bar-filter-button").click();
          getSearchModalContainer().within(() => {
            cy.findByText("All items").click();
            cy.findByText("Apply all filters").click();
          });

          getSearchBar().clear().type("Orders{enter}");
          cy.wait("@search");

          cy.url().should("not.include", `verified=true`);

          let verifiedElementCount = 0;
          let unverifiedElementCount = 0;

          cy.findAllByTestId("search-result-item")
            .each($el => {
              if ($el.find('[aria-label="verified icon"]').length) {
                verifiedElementCount++;
              } else {
                unverifiedElementCount++;
              }
            })
            .then(() => {
              expect(verifiedElementCount).to.eq(1);
              expect(unverifiedElementCount).to.be.gt(0);
            });
        });
      });

      describe("no filters applied", () => {
        it("should not filter results by type when `Clear all filters` is applied", () => {
          cy.visit("/search?q=order&type=card");
          cy.wait("@search");

          cy.findAllByTestId("search-result-item-name");
          cy.findByTestId("search-bar-filter-button").click();

          getSearchModalContainer().within(() => {
            cy.findByText("Clear all filters").click();
          });

          getSearchBar().clear().type("e{enter}");
          cy.wait("@search");

          cy.url().should("not.include", "type=card");

          cy.findAllByTestId("type-sidebar-item").should(
            "have.length",
            typeFilters.length + 1,
          );
        });

        it("should not filter unverified assets when `Clear all filters` is applied", () => {
          cy.visit("/search?q=order&verified=true");
          cy.wait("@search");

          cy.findAllByTestId("search-result-item-name");
          cy.findByTestId("search-bar-filter-button").click();

          getSearchModalContainer().within(() => {
            cy.findByText("Clear all filters").click();
          });

          getSearchBar().clear().type("Orders{enter}");
          cy.wait("@search");

          cy.url().should("not.include", "verified=true");

          let verifiedElementCount = 0;
          let unverifiedElementCount = 0;
          cy.findAllByTestId("search-result-item")
            .each($el => {
              if (!$el.find('[aria-label="verified icon"]').length) {
                unverifiedElementCount++;
              } else {
                verifiedElementCount++;
              }
            })
            .then(() => {
              expect(verifiedElementCount).to.eq(1);
              expect(unverifiedElementCount).to.be.gt(0);
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

function getSearchModalContainer() {
  return cy.findByTestId("search-filter-modal-container");
}
