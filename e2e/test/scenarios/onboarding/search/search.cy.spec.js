import {
  createAction,
  describeEE,
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  modal,
  popover,
  resetSnowplow,
  restore,
  setActionsEnabledForDB,
  setTokenFeatures,
  summarize,
  assertIsEllipsified,
} from "e2e/support/helpers";
import {
  ADMIN_USER_ID,
  NORMAL_USER_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { createModelIndex } from "e2e/support/helpers/e2e-model-index-helper";

const typeFilters = [
  {
    label: "Question",
    type: "card",
  },
  {
    label: "Dashboard",
    type: "dashboard",
  },
  {
    label: "Collection",
    type: "collection",
  },
  {
    label: "Table",
    type: "table",
  },
  {
    label: "Database",
    type: "database",
  },
  {
    label: "Model",
    type: "dataset",
  },
  {
    label: "Action",
    type: "action",
  },
  {
    label: "Indexed record",
    type: "indexed-entity",
  },
];

const { ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

const NORMAL_USER_TEST_QUESTION = {
  name: `Robert's Super Duper Reviews`,
  query: { "source-table": ORDERS_ID, limit: 1 },
  collection_id: null,
};

const ADMIN_TEST_QUESTION = {
  name: `Admin Super Duper Reviews`,
  query: { "source-table": ORDERS_ID, limit: 1 },
  collection_id: null,
};

// Using these names in the `last_edited_by` section to reduce confusion
const LAST_EDITED_BY_ADMIN_QUESTION = NORMAL_USER_TEST_QUESTION;
const LAST_EDITED_BY_NORMAL_USER_QUESTION = ADMIN_TEST_QUESTION;

const REVIEWS_TABLE_NAME = "Reviews";

const TEST_NATIVE_QUESTION_NAME = "GithubUptimeisMagnificentlyHigh";

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

      cy.wait("@search");

      expectSearchResultContent({
        expectedSearchResults: [
          {
            name: "Products",
            description:
              "Includes a catalog of all the products ever sold by the famed Sample Company.",
            collection: "Sample Database",
          },
        ],
        strict: false,
      });

      cy.get("@searchBox").type("{enter}");
      cy.wait("@search");

      expectSearchResultContent({
        expectedSearchResults: [
          {
            name: "Products",
            description:
              "Includes a catalog of all the products ever sold by the famed Sample Company.",
          },
        ],
        strict: false,
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

    it("should render a preview of markdown descriptions", () => {
      cy.createQuestion({
        name: "Description Test",
        query: { "source-table": ORDERS_ID },
        description: `![alt](https://upload.wikimedia.org/wikipedia/commons/a/a2/Cat_outside.jpg)

        Lorem ipsum dolor sit amet.
        
        ----
        
        ## Heading 1
        
        This is a [link](https://upload.wikimedia.org/wikipedia/commons/a/a2/Cat_outside.jpg).
        
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. `,
      }).then(() => {
        cy.signInAsNormalUser();
        cy.visit("/");
        getSearchBar().type("Test");
      });

      //Enseure that text is ellipsified
      cy.findByTestId("result-description")
        .findByText(/Lorem ipsum dolor sit amet./)
        .then(el => assertIsEllipsified(el[0]));

      //Ensure that images are not being rendered in the descriptions
      cy.findByTestId("result-description")
        .findByRole("img")
        .should("not.exist");
    });
  });
  describe("accessing full page search with `Enter`", () => {
    it("should not render full page search if user has not entered a text query", () => {
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

        cy.createQuestion(
          {
            name: "Products Model",
            query: { "source-table": PRODUCTS_ID },
            dataset: true,
          },
          { wrapId: true, idAlias: "modelId" },
        );

        cy.get("@modelId").then(modelId => {
          createModelIndex({
            modelId,
            pkName: "ID",
            valueName: "TITLE",
          });
        });
      });

      typeFilters.forEach(({ label, type }) => {
        it(`should hydrate search with search text and ${label} filter`, () => {
          cy.visit(`/search?q=e&type=${type}`);
          cy.wait("@search");

          getSearchBar().should("have.value", "e");

          cy.findByTestId("search-app").within(() => {
            cy.findByText('Results for "e"').should("exist");
          });

          const regex = new RegExp(`${type}$`);
          cy.findAllByTestId("search-result-item").each(result => {
            cy.wrap(result)
              .should("have.attr", "aria-label")
              .and("match", regex);
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
            cy.findByText("Apply").click();
          });

          const regex = new RegExp(`${type}$`);
          cy.findAllByTestId("search-result-item").each(result => {
            cy.wrap(result)
              .should("have.attr", "aria-label")
              .and("match", regex);
          });
        });
      });

      it("should remove type filter when `X` is clicked on search filter", () => {
        const { label, type } = typeFilters[0];
        cy.visit(`/search?q=e&type=${type}`);
        cy.wait("@search");

        cy.findByTestId("type-search-filter").within(() => {
          cy.findByText(label).should("exist");
          cy.findByLabelText("close icon").click();
          cy.findByText(label).should("not.exist");
          cy.findByText("Content type").should("exist");
        });

        cy.url().should("not.contain", "type");

        cy.findAllByTestId("search-result-item").then($results => {
          const uniqueResults = new Set(
            $results.toArray().map(el => {
              const label = el.getAttribute("aria-label");
              return label.split(" ").slice(-1)[0];
            }),
          );
          expect(uniqueResults.size).to.be.greaterThan(1);
        });
      });
    });

    describe("created_by filter", () => {
      beforeEach(() => {
        restore();
        // create a question from a normal and admin user, then we can query the question
        // created by that user as an admin
        cy.signInAsNormalUser();
        cy.createQuestion(NORMAL_USER_TEST_QUESTION);
        cy.signOut();

        cy.signInAsAdmin();
        cy.createQuestion(ADMIN_TEST_QUESTION);
      });

      it("should hydrate created_by filter", () => {
        cy.visit(
          `/search?created_by=${ADMIN_USER_ID}&created_by=${NORMAL_USER_ID}&q=reviews`,
        );

        cy.wait("@search");

        cy.findByTestId("created_by-search-filter").within(() => {
          cy.findByText("2 users selected").should("exist");
          cy.findByLabelText("close icon").should("exist");
        });

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: ADMIN_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });
      });

      it("should filter results by one user", () => {
        cy.visit("/");

        getSearchBar().clear();
        getSearchBar().type("reviews{enter}");
        cy.wait("@search");

        expectSearchResultItemNameContent({
          itemNames: [
            NORMAL_USER_TEST_QUESTION.name,
            ADMIN_TEST_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        cy.findByTestId("created_by-search-filter").click();

        popover().within(() => {
          cy.findByText("Robert Tableton").click();
          cy.findByText("Apply").click();
        });
        cy.url().should("contain", "created_by");

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
          ],
        });
      });

      it("should filter results by more than one user", () => {
        cy.visit("/");

        getSearchBar().clear().type("reviews{enter}");
        cy.wait("@search");

        expectSearchResultItemNameContent({
          itemNames: [
            NORMAL_USER_TEST_QUESTION.name,
            ADMIN_TEST_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        cy.findByTestId("created_by-search-filter").click();

        popover().within(() => {
          cy.findByText("Robert Tableton").click();
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });
        cy.url().should("contain", "created_by");

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: ADMIN_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });
      });

      it("should be able to remove a user from the `created_by` filter", () => {
        cy.visit(
          `/search?q=reviews&created_by=${NORMAL_USER_ID}&created_by=${ADMIN_USER_ID}`,
        );

        cy.wait("@search");

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: ADMIN_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });

        cy.findByTestId("created_by-search-filter").click();
        popover().within(() => {
          // remove Robert Tableton from the created_by filter
          cy.findByTestId("search-user-select-box")
            .findByText("Robert Tableton")
            .click();
          cy.findByText("Apply").click();
        });

        expectSearchResultItemNameContent({
          itemNames: [ADMIN_TEST_QUESTION.name],
        });
      });

      it("should remove created_by filter when `X` is clicked on filter", () => {
        cy.visit(`/search?q=reviews&created_by=${NORMAL_USER_ID}`);

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
          ],
        });

        cy.findByTestId("created_by-search-filter").within(() => {
          cy.findByText("Robert Tableton").should("exist");
          cy.findByLabelText("close icon").click();
        });

        expectSearchResultItemNameContent({
          itemNames: [
            NORMAL_USER_TEST_QUESTION.name,
            ADMIN_TEST_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });
      });

      ["normal", "sandboxed"].forEach(userType => {
        it(`should allow ${userType} (non-admin) user to see users and filter by created_by`, () => {
          cy.signIn(userType);
          cy.visit("/");

          getSearchBar().clear();
          getSearchBar().type("reviews{enter}");
          cy.wait("@search");

          expectSearchResultItemNameContent(
            {
              itemNames: [
                NORMAL_USER_TEST_QUESTION.name,
                ADMIN_TEST_QUESTION.name,
              ],
            },
            { strict: false },
          );

          cy.findByTestId("created_by-search-filter").click();

          popover().within(() => {
            cy.findByText("Bobby Tables").click();
            cy.findByText("Apply").click();
          });
          cy.url().should("contain", "created_by");

          expectSearchResultContent({
            expectedSearchResults: [
              {
                name: ADMIN_TEST_QUESTION.name,
                timestamp: "Created a few seconds ago by Bobby Tables",
                collection: "Our analytics",
              },
            ],
          });
        });
      });
    });

    describe("last_edited_by filter", () => {
      beforeEach(() => {
        cy.signInAsAdmin();
        // We'll create a question as a normal user, then edit it as an admin user
        cy.createQuestion(LAST_EDITED_BY_NORMAL_USER_QUESTION).then(
          ({ body: { id: questionId } }) => {
            cy.signOut();
            cy.signInAsNormalUser();
            cy.visit(`/question/${questionId}`);
            summarize();
            cy.findByTestId("sidebar-right").findByText("Done").click();
            cy.findByTestId("qb-header-action-panel")
              .findByText("Save")
              .click();
            modal().findByText("Save").click();
          },
        );

        // We'll create a question as an admin user, then edit it as a normal user
        cy.createQuestion(LAST_EDITED_BY_ADMIN_QUESTION).then(
          ({ body: { id: questionId } }) => {
            cy.signInAsAdmin();
            cy.visit(`/question/${questionId}`);
            summarize();
            cy.findByTestId("sidebar-right").findByText("Done").click();
            cy.findByTestId("qb-header-action-panel")
              .findByText("Save")
              .click();
            modal().findByText("Save").click();
          },
        );
      });

      it("should hydrate last_edited_by filter", () => {
        cy.intercept("GET", "/api/user").as("getUsers");

        cy.visit(`/search?q=reviews&last_edited_by=${NORMAL_USER_ID}`);

        cy.wait("@search");

        cy.findByTestId("last_edited_by-search-filter").within(() => {
          cy.findByText("Robert Tableton").should("exist");
          cy.findByLabelText("close icon").should("exist");
        });

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
          ],
        });
      });

      it("should filter last_edited results by one user", () => {
        cy.visit("/");

        getSearchBar().clear().type("reviews{enter}");
        cy.wait("@search");

        cy.findByTestId("last_edited_by-search-filter").click();

        expectSearchResultItemNameContent({
          itemNames: [
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
            LAST_EDITED_BY_ADMIN_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        popover().within(() => {
          cy.findByText("Robert Tableton").click();
          cy.findByText("Apply").click();
        });
        cy.url().should("contain", "last_edited_by");

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
          ],
        });
      });

      it("should filter last_edited results by more than user", () => {
        cy.visit("/");

        getSearchBar().clear().type("reviews{enter}");
        cy.wait("@search");

        cy.findByTestId("last_edited_by-search-filter").click();

        expectSearchResultItemNameContent({
          itemNames: [
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
            LAST_EDITED_BY_ADMIN_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        popover().within(() => {
          cy.findByText("Robert Tableton").click();
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });
        cy.url().should("contain", "last_edited_by");

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: LAST_EDITED_BY_ADMIN_QUESTION.name,
              timestamp: "Updated a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });
      });

      it("should allow to remove a user from the `last_edited_by` filter", () => {
        cy.visit(
          `/search?q=reviews&last_edited_by=${NORMAL_USER_ID}&last_edited_by=${ADMIN_USER_ID}`,
        );

        cy.wait("@search");

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: LAST_EDITED_BY_ADMIN_QUESTION.name,
              timestamp: "Updated a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });

        cy.findByTestId("last_edited_by-search-filter").click();
        popover().within(() => {
          // remove Robert Tableton from the last_edited_by filter
          cy.findByTestId("search-user-select-box")
            .findByText("Robert Tableton")
            .click();
          cy.findByText("Apply").click();
        });

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_ADMIN_QUESTION.name,
              timestamp: "Updated a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });
      });

      it("should remove last_edited_by filter when `X` is clicked on filter", () => {
        cy.visit(
          `/search?q=reviews&last_edited_by=${NORMAL_USER_ID}&last_edited_by=${ADMIN_USER_ID}`,
        );

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
            {
              name: LAST_EDITED_BY_ADMIN_QUESTION.name,
              timestamp: "Updated a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });

        cy.findByTestId("last_edited_by-search-filter").within(() => {
          cy.findByText("2 users selected").should("exist");
          cy.findByLabelText("close icon").click();
        });

        expectSearchResultItemNameContent({
          itemNames: [
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
            LAST_EDITED_BY_ADMIN_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });
      });

      ["normal", "sandboxed"].forEach(userType => {
        it(`should allow ${userType} (non-admin) user to see users and filter by last_edited_by`, () => {
          cy.signIn(userType);
          cy.visit("/");

          getSearchBar().clear();
          getSearchBar().type("reviews{enter}");
          cy.wait("@search");

          expectSearchResultItemNameContent(
            {
              itemNames: [
                NORMAL_USER_TEST_QUESTION.name,
                ADMIN_TEST_QUESTION.name,
              ],
            },
            { strict: false },
          );

          cy.findByTestId("last_edited_by-search-filter").click();

          popover().within(() => {
            cy.findByText("Bobby Tables").click();
            cy.findByText("Apply").click();
          });
          cy.url().should("contain", "last_edited_by");

          expectSearchResultContent({
            expectedSearchResults: [
              {
                name: LAST_EDITED_BY_ADMIN_QUESTION.name,
                timestamp: "Updated a few seconds ago by Bobby Tables",
                collection: "Our analytics",
              },
            ],
          });
        });
      });
    });

    describe("created_at filter", () => {
      beforeEach(() => {
        cy.signInAsNormalUser();
        cy.createQuestion(NORMAL_USER_TEST_QUESTION);
        cy.signOut();
        cy.signInAsAdmin();
      });

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
        cy.visit(`/search?q=Reviews`);

        expectSearchResultItemNameContent(
          {
            itemNames: [REVIEWS_TABLE_NAME, NORMAL_USER_TEST_QUESTION.name],
          },
          { strict: false },
        );

        cy.findByTestId("created_at-search-filter").click();
        popover().within(() => {
          cy.findByText("Today").click();
        });

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              collection: "Our analytics",
              timestamp: "Created a few seconds ago by Robert Tableton",
            },
          ],
          strict: false,
        });
      });

      it("should remove created_at filter when `X` is clicked on search filter", () => {
        cy.visit(`/search?q=Reviews&created_at=thisday`);
        cy.wait("@search");

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              collection: "Our analytics",
              timestamp: "Created a few seconds ago by Robert Tableton",
            },
          ],
          strict: false,
        });

        cy.findByTestId("created_at-search-filter").within(() => {
          cy.findByText("Today").should("exist");

          cy.findByLabelText("close icon").click();

          cy.findByText("Today").should("not.exist");
          cy.findByText("Creation date").should("exist");
        });

        cy.url().should("not.contain", "created_at");

        expectSearchResultItemNameContent(
          {
            itemNames: [REVIEWS_TABLE_NAME, NORMAL_USER_TEST_QUESTION.name],
          },
          { strict: false },
        );
      });
    });

    describe("last_edited_at filter", () => {
      beforeEach(() => {
        cy.signInAsAdmin();
        // We'll create a question as a normal user, then edit it as an admin user
        cy.createQuestion(LAST_EDITED_BY_NORMAL_USER_QUESTION).then(
          ({ body: { id: questionId } }) => {
            cy.signOut();
            cy.signInAsNormalUser();
            cy.visit(`/question/${questionId}`);
            summarize();
            cy.findByTestId("sidebar-right").findByText("Done").click();
            cy.findByTestId("qb-header-action-panel")
              .findByText("Save")
              .click();
            modal().findByText("Save").click();
            cy.signOut();
            cy.signInAsAdmin();
          },
        );
      });

      TEST_CREATED_AT_FILTERS.forEach(([label, filter]) => {
        it(`should hydrate last_edited_at=${filter}`, () => {
          cy.visit(`/search?q=reviews&last_edited_at=${filter}`);

          cy.wait("@search");

          cy.findByTestId("last_edited_at-search-filter").within(() => {
            cy.findByText(label).should("exist");
            cy.findByLabelText("close icon").should("exist");
          });
        });
      });

      // we can only test the 'today' filter since we currently
      // can't edit the last_edited_at column of a question in our database
      it(`should filter results by Today (last_edited_at=thisday)`, () => {
        cy.visit(`/search?q=Reviews`);

        expectSearchResultItemNameContent({
          itemNames: [
            REVIEWS_TABLE_NAME,
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
          ],
        });

        cy.findByTestId("last_edited_at-search-filter").click();
        popover().within(() => {
          cy.findByText("Today").click();
        });

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              collection: "Our analytics",
              timestamp: "Updated a few seconds ago by Robert Tableton",
            },
          ],
          strict: false,
        });
      });

      it("should remove last_edited_at filter when `X` is clicked on search filter", () => {
        cy.visit(`/search?q=Reviews&last_edited_at=thisday`);
        cy.wait("@search");

        expectSearchResultContent({
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              collection: "Our analytics",
              timestamp: "Updated a few seconds ago by Robert Tableton",
            },
          ],
          strict: false,
        });

        cy.findByTestId("last_edited_at-search-filter").within(() => {
          cy.findByText("Today").should("exist");

          cy.findByLabelText("close icon").click();

          cy.findByText("Today").should("not.exist");
          cy.findByText("Last edit date").should("exist");
        });

        cy.url().should("not.contain", "last_edited_at");

        expectSearchResultItemNameContent({
          itemNames: [
            REVIEWS_TABLE_NAME,
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
          ],
        });
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
            cy.findByLabelText("verified_filled icon").should("exist");
          });
        });
      });

      it("should filter results by verified items", () => {
        cy.visit("/");

        getSearchBar().clear().type("e{enter}");
        cy.wait("@search");

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();

        cy.wait("@search");

        cy.findAllByTestId("search-result-item").each(result => {
          cy.wrap(result).within(() => {
            cy.findByLabelText("verified_filled icon").should("exist");
          });
        });
      });

      it("should not filter results when verified items is off", () => {
        cy.visit("/search?q=e&verified=true");

        cy.wait("@search");

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();
        cy.url().should("not.include", "verified=true");

        let verifiedElementCount = 0;
        let unverifiedElementCount = 0;
        cy.findAllByTestId("search-result-item")
          .each($el => {
            if (!$el.find('[aria-label="verified_filled icon"]').length) {
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

    describe("native query filter", () => {
      beforeEach(() => {
        cy.signInAsAdmin();
        cy.createNativeQuestion({
          name: TEST_NATIVE_QUESTION_NAME,
          native: {
            query: "SELECT 'reviews';",
          },
        });

        cy.createNativeQuestion({
          name: "Native Query",
          native: {
            query: `SELECT '${TEST_NATIVE_QUESTION_NAME}';`,
          },
        });
      });

      it("should hydrate search with search text and native query filter", () => {
        cy.visit(
          `/search?q=${TEST_NATIVE_QUESTION_NAME}&search_native_query=true`,
        );
        cy.wait("@search");

        getSearchBar().should("have.value", TEST_NATIVE_QUESTION_NAME);

        cy.findByTestId("search-app").within(() => {
          cy.findByText(`Results for "${TEST_NATIVE_QUESTION_NAME}"`).should(
            "exist",
          );
        });

        expectSearchResultItemNameContent({
          itemNames: [TEST_NATIVE_QUESTION_NAME, "Native Query"],
        });
      });

      it("should include results that contain native query data when the toggle is on", () => {
        cy.visit(`/search?q=${TEST_NATIVE_QUESTION_NAME}`);
        cy.wait("@search");

        expectSearchResultItemNameContent({
          itemNames: [TEST_NATIVE_QUESTION_NAME],
        });

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        cy.url().should("include", "search_native_query=true");

        expectSearchResultItemNameContent({
          itemNames: [TEST_NATIVE_QUESTION_NAME, "Native Query"],
        });
      });

      it("should not include results that contain native query data if the toggle is off", () => {
        cy.visit(
          `/search?q=${TEST_NATIVE_QUESTION_NAME}&search_native_query=true`,
        );
        cy.wait("@search");

        expectSearchResultItemNameContent({
          itemNames: [TEST_NATIVE_QUESTION_NAME, "Native Query"],
        });

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        expectSearchResultItemNameContent({
          itemNames: [TEST_NATIVE_QUESTION_NAME],
        });
      });
    });

    it("should persist filters when the user changes the text query", () => {
      cy.visit("/search?q=orders");

      // add created_by filter
      cy.findByTestId("created_by-search-filter").click();
      popover().within(() => {
        cy.findByText("Bobby Tables").click();
        cy.findByText("Apply").click();
      });

      // add last_edited_by filter
      cy.findByTestId("last_edited_by-search-filter").click();
      popover().within(() => {
        cy.findByText("Bobby Tables").click();
        cy.findByText("Apply").click();
      });

      // add type filter
      cy.findByTestId("type-search-filter").click();
      popover().within(() => {
        cy.findByText("Question").click();
        cy.findByText("Apply").click();
      });

      expectSearchResultItemNameContent({
        itemNames: [
          "Orders",
          "Orders, Count",
          "Orders, Count, Grouped by Created At (year)",
        ],
      });

      getSearchBar().clear().type("count{enter}");

      expectSearchResultItemNameContent({
        itemNames: [
          "Orders, Count",
          "Orders, Count, Grouped by Created At (year)",
        ],
      });
    });
  });
});

describeWithSnowplow("scenarios > search", () => {
  const SEARCH_RESULTS_FILTERED_NAME = "search_results_filtered";
  const NEW_SEARCH_QUERY_EVENT_NAME = "new_search_query";

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
    getSearchBar().type("Orders").blur();
    expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
  });

  describe("should send snowplow events for each filter when it is applied and removed", () => {
    describe("no filters", () => {
      it("should send a new_search_query snowplow event, but not search_results_filtered when a search with no filters is accessed from the URL", () => {
        cy.visit("/search?q=orders");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);
      });
    });

    describe("type filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&type=card");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("type-search-filter").click();
        popover().within(() => {
          cy.findAllByTestId("type-filter-checkbox").each($el => {
            cy.wrap($el).click();
          });
          cy.findByText("Apply").click();
        });

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&type=card");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("type-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describe("created_by filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&created_by=1");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("created_by-search-filter").click();
        popover().within(() => {
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&created_by=1");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("created_by-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describe("last_edited_by filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&last_edited_by=1");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("last_edited_by-search-filter").click();
        popover().within(() => {
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&last_edited_by=1");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("last_edited_by-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describe("created_at filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&created_at=thisday");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("created_at-search-filter").click();
        popover().within(() => {
          cy.findByText("Today").click();
        });

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&created_at=thisday");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("created_at-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describe("last_edited_at filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&last_edited_at=thisday");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("last_edited_at-search-filter").click();
        popover().within(() => {
          cy.findByText("Today").click();
        });

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&last_edited_at=thisday");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("last_edited_at-search-filter")
          .findByLabelText("close icon")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describeEE("verified filter", () => {
      beforeEach(() => {
        setTokenFeatures("all");
      });

      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&verified=true");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&verified=true");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("verified-search-filter")
          .findByText("Verified items only")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });

    describe("search_native_query filter", () => {
      it("should send a snowplow event when a search filter is used in the URL", () => {
        cy.visit("/search?q=orders&search_native_query=true");
        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is applied from the UI", () => {
        cy.visit("/search?q=orders");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 0);

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });

      it("should send a snowplow event when a search filter is removed from the UI", () => {
        cy.visit("/search?q=orders&search_native_query=true");

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 1);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);

        cy.findByTestId("search_native_query-search-filter")
          .findByText("Search the contents of native queries")
          .click();

        expectGoodSnowplowEvent({ event: NEW_SEARCH_QUERY_EVENT_NAME }, 2);
        expectGoodSnowplowEvent({ event: SEARCH_RESULTS_FILTERED_NAME }, 1);
      });
    });
  });
});

function getSearchBar() {
  return cy.findByPlaceholderText("Search…");
}

function expectSearchResultItemNameContent(
  { itemNames },
  { strict } = { strict: true },
) {
  cy.findAllByTestId("search-result-item-name").then($searchResultLabel => {
    const searchResultLabelList = $searchResultLabel
      .toArray()
      .map(el => el.textContent);

    if (strict) {
      expect(searchResultLabelList).to.have.length(itemNames.length);
    }
    expect(searchResultLabelList).to.include.members(itemNames);
  });
}

/**
 * Checks the search results against expectedSearchValues, including descriptions,
 * collection names, and timestamps, depending on the given data.
 *
 * @param {Object} options - Options for the test.
 * @param {Object[]} options.expectedSearchResults - An array of search result items to compare against.
 * @param {string} options.expectedSearchResults[].name - The name of the search result item.
 * @param {string} options.expectedSearchResults[].description - The description of the search result item.
 * @param {string} options.expectedSearchResults[].collection - The collection label of the search result item.
 * @param {string} options.expectedSearchResults[].timestamp - The timestamp label of the search result item .
 * @param {boolean} [strict=true] - Whether to check if the contents AND length of search results are the same
 */
function expectSearchResultContent({ expectedSearchResults, strict = true }) {
  const searchResultItemSelector = "[data-testid=search-result-item]";

  const searchResultItems = cy.get(searchResultItemSelector);

  searchResultItems.then($results => {
    if (strict) {
      // Check if the length of the search results is the same as the expected length
      expect($results).to.have.length(expectedSearchResults.length);
    }
  });

  for (const expectedSearchResult of expectedSearchResults) {
    cy.contains(searchResultItemSelector, expectedSearchResult.name).within(
      () => {
        cy.findByTestId("search-result-item-name").should(
          "have.text",
          expectedSearchResult.name,
        );

        if (expectedSearchResult.description) {
          cy.findByTestId("result-description").should(
            "have.text",
            expectedSearchResult.description,
          );
        }

        if (expectedSearchResult.collection) {
          cy.findAllByTestId("result-link-wrapper").first(() => {
            cy.findByText(expectedSearchResult.collection).should("exist");
          });
        }
        if (expectedSearchResult.timestamp) {
          cy.findByTestId("revision-history-button").should(
            "have.text",
            expectedSearchResult.timestamp,
          );
        }
      },
    );
  }
}
