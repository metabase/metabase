import _ from "underscore";
import {
  createAction,
  describeEE,
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  popover,
  resetSnowplow,
  restore,
  setActionsEnabledForDB,
  setTokenFeatures,
} from "e2e/support/helpers";
import {
  NORMAL_USER_ID,
  ORDERS_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
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
    resultInfoText: "for",
  },
];

const { ORDERS_ID } = SAMPLE_DATABASE;
const TEST_QUESTIONS = generateQuestions("Robert's Question", 5);

const TEST_CREATED_AT_FILTERS = [
  ["Today", "thisday"],
  ["Yesterday", "past1days"],
  ["Previous Week", "past1weeks"],
  ["Previous 7 Days", "past7days"],
  ["Previous 30 Days", "past30days"],
  ["Previous Month", "past1months"],
  ["Previous 3 Months", "past3months"],
  ["Previous 12 Months", "past12months"],
];

describe("scenarios > search", () => {
  beforeEach(() => {
    restore();
    cy.intercept("GET", "/api/search?q=*").as("search");
    cy.signInAsAdmin();
  });

  describe("universal search", () => {
    it("should work for admin (metabase#20018)", () => {
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

      cy.findByTestId("app-bar").findByDisplayValue("ord");
      cy.findAllByTestId("search-result-item-name")
        .first()
        .should("have.text", "Orders");

      cy.realPress("ArrowDown");
      cy.realPress("Enter");

      cy.location("pathname").should(
        "eq",
        `/question/${ORDERS_QUESTION_ID}-orders`,
      );

      cy.get("@search.all").should("have.length", 1);
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

  describe("applying search filters", () => {
    describe("no filters", () => {
      it("hydrating search from URL", () => {
        cy.visit("/search?q=orders");
        cy.wait("@search");

        getSearchBar().should("have.value", "orders");
        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "orders"').should("exist");
        });
      });
    });

    describe("type filter", () => {
      beforeEach(() => {
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

      typeFilters.forEach(({ label, filterName, resultInfoText }) => {
        it(`should hydrate search with search text and ${label} filter`, () => {
          const searchText = "e";
          cy.visit(`/search?q=${searchText}&type=${filterName}`);
          cy.wait("@search");

          getSearchBar().should("have.value", searchText);

          cy.findByTestId("search-app").within(() => {
            cy.findByText(`Results for "${searchText}"`).should("exist");
          });

          cy.findAllByTestId("result-link-info-text").each(result => {
            cy.wrap(result).should("contain.text", resultInfoText);
          });

          cy.findByTestId("type-search-filter").within(() => {
            cy.findByText(label).should("exist");
            cy.findByLabelText("close icon").should("exist");
          });
        });

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
        const { label, filterName } = typeFilters[0];
        cy.visit(`/search?q=e&type=${filterName}`);
        cy.wait("@search");

        cy.findByTestId("type-search-filter").within(() => {
          cy.findByText(label).should("exist");
          cy.findByLabelText("close icon").click();
          cy.findByText(label).should("not.exist");
          cy.findByText("Content type").should("exist");
        });

        cy.url().should("not.contain", "type");

        // Check that we're getting elements other than Questions by checking the
        // result text and checking if there's more than one result-link-info-text text
        cy.findAllByTestId("result-link-info-text").then(
          $resultTypeDescriptions => {
            const uniqueTypeDescriptions = new Set(
              $resultTypeDescriptions.toArray().map(el => el.textContent),
            );
            expect(uniqueTypeDescriptions.size).to.be.greaterThan(1);
          },
        );
      });
    });

    describe("created_by filter", () => {
      beforeEach(() => {
        // create a bunch of questions from a normal user, then we can query the question
        // created by that user as an admin
        cy.signInAsNormalUser();
        for (const question of TEST_QUESTIONS) {
          cy.createQuestion(question);
        }
        cy.signOut();

        cy.signInAsAdmin();
      });

      it("should hydrate created_by filter", () => {
        cy.intercept("GET", "/api/user").as("getUsers");

        cy.request("GET", "/api/user/current").then(
          ({ body: { common_name, id } }) => {
            cy.visit(`/search?q=orders&created_by=${id}`);

            cy.wait("@search");
            cy.wait("@getUsers");

            cy.findByTestId("created_by-search-filter").within(() => {
              cy.findByText(common_name).should("exist");
              cy.findByLabelText("close icon").should("exist");
            });
          },
        );

        // TODO: Add more assertions for search results when we redesign the search result elements to include users.
      });

      it("should filter results by user", () => {
        cy.visit("/");

        getSearchBar().clear().type("e{enter}");
        cy.wait("@search");

        cy.findByTestId("created_by-search-filter").click();

        popover().within(() => {
          cy.findByText("Robert Tableton").click();
          cy.findByText("Apply filters").click();
        });
        cy.url().should("contain", "created_by");

        cy.findAllByTestId("search-result-item").each(result => {
          cy.wrap(result).should("contain.text", "Robert's Question");
        });
      });

      it("should remove created_by filter when `X` is clicked on filter", () => {
        cy.visit(`/search?q=e&created_by=${NORMAL_USER_ID}`);

        cy.findByTestId("created_by-search-filter").within(() => {
          cy.findByText("Robert Tableton").should("exist");
          cy.findByLabelText("close icon").click();
        });

        // Check that we're getting elements from other users by checking for other types,
        // since all assets, for the user we're querying are questions
        cy.findAllByTestId("result-link-info-text").then(
          $resultTypeDescriptions => {
            const uniqueTypeDescriptions = new Set(
              $resultTypeDescriptions.toArray().map(el => el.textContent),
            );
            expect(uniqueTypeDescriptions.size).to.be.greaterThan(1);
          },
        );
      });
    });

    describeEE("verified filter", () => {
      beforeEach(() => {
        setTokenFeatures("all");
        cy.createModerationReview({
          status: "verified",
          moderated_item_type: "card",
          moderated_item_id: ORDERS_COUNT_QUESTION_ID,
        });
      });

      it("should hydrate search with search text and verified filter", () => {
        cy.visit("/search?q=orders&verified=true");
        cy.wait("@search");

        getSearchBar().should("have.value", "orders");

        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "orders"').should("exist");
        });

        cy.findAllByTestId("search-result-item").each(result => {
          cy.wrap(result).within(() => {
            cy.findByLabelText("verified icon").should("exist");
          });
        });
      });

      it("should filter results by verified items", () => {
        cy.visit("/");

        getSearchBar().clear().type("e{enter}");
        cy.wait("@search");

        cy.findByTestId("verified-search-filter")
          .findByTestId("toggle-filter-switch")
          .click();

        cy.findAllByTestId("search-result-item").each(result => {
          cy.wrap(result).within(() => {
            cy.findByLabelText("verified icon").should("exist");
          });
        });
      });

      it("should not filter results when verified items is off", () => {
        cy.visit("/search?q=e&verified=true");

        cy.wait("@search");

        cy.findByTestId("verified-search-filter")
          .findByTestId("toggle-filter-switch")
          .click();
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

    describe("created_at filter", () => {
      TEST_CREATED_AT_FILTERS.forEach(([label, filter]) => {
        it(`should hydrate created_at=${filter}`, () => {
          cy.visit(`/search?q=orders&created_at=${filter}`);

          cy.wait("@search");

          cy.findByTestId("created_at-search-filter").within(() => {
            cy.findByText(label).should("exist");
            cy.findByLabelText("close icon").should("exist");
          });
        });
      });

      // we can only test the 'today' filter since we currently
      // can't edit the created_at column of a question in our database
      it(`should filter results by Today (created_at=thisday)`, () => {
        cy.visit(`/search?q=Test`);
        cy.findByTestId("created_at-search-filter").click();

        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "Test"').should("exist");
          cy.findByText("Test Question from Today").should("not.exist");
        });

        cy.createQuestion({
          name: "Test Question from Today",
          query: { "source-table": ORDERS_ID },
        });

        popover().within(() => {
          cy.findByText("Today").click();
        });

        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "Test"').should("exist");
          cy.findByText("Test Question from Today").should("exist");
        });
      });

      it("should remove created_at filter when `X` is clicked on search filter", () => {
        cy.createQuestion({
          name: "Test Question from Today",
          query: { "source-table": ORDERS_ID },
        });

        cy.visit(`/search?q=Test&created_at=past1days`);

        cy.wait("@search");

        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "Test"').should("exist");
          cy.findByText("Test Question from Today").should("not.exist");
        });

        cy.findByTestId("created_at-search-filter").within(() => {
          cy.findByText("Yesterday").should("exist");
          cy.findByLabelText("close icon").click();
          cy.findByText("Yesterday").should("not.exist");
          cy.findByText("Creation date").should("exist");
        });

        cy.url().should("not.contain", "created_at");

        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "Test"').should("exist");
          cy.findByText("Test Question from Today").should("exist");
        });

        // TODO: Add more assertions for search results when we redesign the search result elements to include users.
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

function generateQuestions(prefix, count) {
  return _.range(count).map(idx => ({
    name: `${prefix} ${idx + 1}`,
    query: { "source-table": ORDERS_ID },
    collection_id: null,
  }));
}
