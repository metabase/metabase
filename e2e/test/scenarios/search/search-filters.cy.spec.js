const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ADMIN_USER_ID,
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  NORMAL_USER_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
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
  {
    label: "Document",
    type: "document",
  },
];

const { ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

const NORMAL_USER_TEST_QUESTION = {
  name: "Robert's Super Duper Reviews",
  query: { "source-table": ORDERS_ID, limit: 1 },
  collection_id: null,
};

const ADMIN_TEST_QUESTION = {
  name: "Admin Super Duper Reviews",
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
  ["Previous week", "past1weeks"],
  ["Previous 7 days", "past7days"],
  ["Previous 30 days", "past30days"],
  ["Previous month", "past1months"],
  ["Previous 3 months", "past3months"],
  ["Previous 12 months", "past12months"],
];

describe("scenarios > search", () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("GET", "/api/search?q=*").as("search");
    cy.signInAsAdmin();
  });

  describe("applying search filters", () => {
    describe("no filters", () => {
      it("hydrates the search page and the command palette search from the URL (#71248)", () => {
        cy.visit("/search?q=products");
        cy.wait("@search");
        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "products"').should("exist");
        });
        H.commandPaletteButton().should("contain.text", "products");

        cy.intercept("GET", "/api/search?q=products*").as("paletteSearch");
        H.commandPaletteButton().click();
        H.commandPaletteInput().should("have.value", "products");
        cy.wait("@paletteSearch");

        H.commandPalette().within(() => {
          cy.findByRole("option", { name: "Products" }).should("be.visible");
        });
      });
    });

    describe("type filter", () => {
      beforeEach(() => {
        H.setActionsEnabledForDB(SAMPLE_DB_ID);

        H.createQuestion({
          name: "Orders Model",
          query: { "source-table": ORDERS_ID },
          type: "model",
        }).then(({ body: { id } }) => {
          H.createAction({
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

        H.createQuestion(
          {
            name: "Products Model",
            query: { "source-table": PRODUCTS_ID },
            type: "model",
          },
          { wrapId: true, idAlias: "modelId" },
        );

        cy.get("@modelId").then((modelId) => {
          createModelIndex({
            modelId,
            pkName: "ID",
            valueName: "TITLE",
          });
        });

        H.createDocument({
          name: "Releases overview",
          document: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                attrs: { _id: "1" },
                content: [{ type: "text", text: "Document body" }],
              },
            ],
          },
        });
      });

      it("should filter results by each type, hydrate the filter from the URL, and remove it with `X`", () => {
        typeFilters.forEach(({ label, type }) => {
          const regex = new RegExp(`${type}$`);
          const expectResultsOfType = () => {
            cy.findAllByTestId("search-result-item").each((result) => {
              cy.wrap(result)
                .should("have.attr", "aria-label")
                .and("match", regex);
            });
          };

          cy.intercept("GET", "/api/search?q=*").as(`search-${type}`);
          cy.visit("/");

          H.commandPaletteSearch("e");
          cy.wait(`@search-${type}`);

          cy.findByTestId("type-search-filter").click();
          H.popover().within(() => {
            cy.findByText(label).click();
            cy.findByText("Apply").click();
          });
          cy.url().should("contain", `type=${type}`);
          expectResultsOfType();

          cy.intercept("GET", "/api/search?q=*").as(`hydratedSearch-${type}`);
          cy.visit(`/search?q=e&type=${type}`);
          cy.wait(`@hydratedSearch-${type}`);

          cy.findByTestId("search-app").within(() => {
            cy.findByText('Results for "e"').should("exist");
          });
          expectResultsOfType();

          cy.findByTestId("type-search-filter").within(() => {
            cy.findByText(label).should("exist");
            cy.findByLabelText("close icon").click();
            cy.findByText(label).should("not.exist");
            cy.findByText("Content type").should("exist");
          });

          cy.url().should("not.contain", "type");

          cy.findAllByTestId("search-result-item").should(($results) => {
            const uniqueResults = new Set(
              $results.toArray().map((el) => {
                const label = el.getAttribute("aria-label");
                return label.split(" ").slice(-1)[0];
              }),
            );
            expect(uniqueResults.size).to.be.greaterThan(1);
          });
        });
      });
    });

    describe("created_by filter", () => {
      beforeEach(() => {
        // create a question from a normal and admin user, then we can query the question
        // created by that user as an admin
        cy.signInAsNormalUser();
        H.createQuestion(NORMAL_USER_TEST_QUESTION);
        cy.signOut();

        cy.signInAsAdmin();
        H.createQuestion(ADMIN_TEST_QUESTION);
      });

      it("should filter results by one or more creators and Today, hydrate the date, and remove the filters with `X`", () => {
        cy.then(() => {
          cy.clock(Date.now(), ["Date"]);
        });
        cy.visit("/");

        H.commandPaletteSearch("reviews");
        cy.wait("@search");

        expectSearchResultItemNameContent({
          itemNames: [
            NORMAL_USER_TEST_QUESTION.name,
            ADMIN_TEST_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        cy.findByTestId("created_by-search-filter").click();

        H.popover().within(() => {
          cy.findByText("Robert Tableton").click();
          cy.findByText("Apply").click();
        });
        cy.url().should("contain", "created_by");

        H.expectSearchResultContent({
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              timestamp: "Created a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
          ],
        });

        cy.intercept("GET", "/api/search?q=*").as("freshSearch");
        cy.visit("/");

        H.commandPaletteSearch("reviews");
        cy.wait("@freshSearch");

        expectSearchResultItemNameContent({
          itemNames: [
            NORMAL_USER_TEST_QUESTION.name,
            ADMIN_TEST_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        cy.findByTestId("created_by-search-filter").click();

        H.popover().within(() => {
          cy.findByText("Robert Tableton").click();
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });
        cy.url().should("contain", `created_by=${ADMIN_USER_ID}`);

        H.expectSearchResultContent({
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

        cy.intercept("GET", "/api/search?q=*").as("hydratedSearch");
        cy.visit(`/search?q=reviews&created_by=${NORMAL_USER_ID}`);
        cy.wait("@hydratedSearch");

        H.expectSearchResultContent({
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
        cy.url().should("not.contain", "created_by");

        expectSearchResultItemNameContent({
          itemNames: [
            NORMAL_USER_TEST_QUESTION.name,
            ADMIN_TEST_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        cy.visit("/search?q=Reviews");

        expectSearchResultItemNameContent(
          {
            itemNames: [REVIEWS_TABLE_NAME, NORMAL_USER_TEST_QUESTION.name],
          },
          { strict: false },
        );

        cy.findByTestId("created_at-search-filter").click();
        H.popover().within(() => {
          cy.findByText("Today").click();
        });
        cy.url().should("contain", "created_at=thisday");
        cy.findByTestId("created_at-search-filter")
          .findByText("Today")
          .should("exist");

        H.expectSearchResultContent({
          expectedSearchResults: [
            {
              name: NORMAL_USER_TEST_QUESTION.name,
              collection: "Our analytics",
              timestamp: "Created a few seconds ago by Robert Tableton",
            },
          ],
          strict: false,
        });

        cy.intercept("GET", "/api/search?q=*").as("createdAtHydratedSearch");
        cy.visit("/search?q=Reviews&created_at=thisday");
        cy.wait("@createdAtHydratedSearch");

        H.expectSearchResultContent({
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

      it("should hydrate created_by filter and remove a user from it", () => {
        cy.visit(
          `/search?created_by=${ADMIN_USER_ID}&created_by=${NORMAL_USER_ID}&q=reviews`,
        );

        cy.wait("@search");

        cy.findByTestId("created_by-search-filter").within(() => {
          cy.findByText("2 users selected").should("exist");
          cy.findByLabelText("close icon").should("exist");
        });

        H.expectSearchResultContent({
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
        H.popover().within(() => {
          // remove Robert Tableton from the created_by filter
          cy.findByTestId("search-user-select-box")
            .findByText("Robert Tableton")
            .click();
          cy.findByText("Apply").click();
        });
        cy.url().should("not.contain", `created_by=${NORMAL_USER_ID}`);

        expectSearchResultItemNameContent({
          itemNames: [ADMIN_TEST_QUESTION.name],
        });
      });

      it("should allow non-admin users to see users and filter by created_by", () => {
        ["normal", "sandboxed"].forEach((userType) => {
          cy.signIn(userType);
          cy.intercept("GET", "/api/search?q=*").as(`${userType}Search`);
          cy.visit("/");

          H.commandPaletteSearch("reviews");
          cy.wait(`@${userType}Search`);

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

          H.popover().within(() => {
            cy.findByText("Bobby Tables").click();
            cy.findByText("Apply").click();
          });
          cy.url().should("contain", "created_by");

          H.expectSearchResultContent({
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
        // We'll create a question as an admin user, then edit it as a normal user
        H.createQuestion(LAST_EDITED_BY_NORMAL_USER_QUESTION).then(
          ({ body: { id: questionId } }) => {
            cy.signOut();
            cy.signInAsNormalUser();
            cy.visit(`/question/${questionId}`);
            H.summarize();
            cy.findByTestId("sidebar-right").findByText("Done").click();
            cy.findByTestId("qb-header-action-panel")
              .findByText("Save")
              .click();
            cy.findByTestId("save-question-modal").findByText("Save").click();
          },
        );

        // We'll create a question as a normal user, then edit it as an admin user
        H.createQuestion(LAST_EDITED_BY_ADMIN_QUESTION).then(
          ({ body: { id: questionId } }) => {
            cy.signInAsAdmin();
            cy.visit(`/question/${questionId}`);
            H.summarize();
            cy.findByTestId("sidebar-right").findByText("Done").click();
            cy.findByTestId("qb-header-action-panel")
              .findByText("Save")
              .click();
            cy.findByTestId("save-question-modal").findByText("Save").click();
          },
        );
      });

      it("should filter last_edited results by one or more users and hydrate the filter from the URL", () => {
        cy.visit("/");

        H.commandPaletteSearch("reviews");
        cy.wait("@search");

        expectSearchResultItemNameContent({
          itemNames: [
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
            LAST_EDITED_BY_ADMIN_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        cy.findByTestId("last_edited_by-search-filter").click();

        H.popover().within(() => {
          cy.findByText("Robert Tableton").click();
          cy.findByText("Apply").click();
        });
        cy.url().should("contain", "last_edited_by");

        H.expectSearchResultContent({
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
          ],
        });

        cy.intercept("GET", "/api/search?q=*").as("freshSearch");
        cy.visit("/");

        H.commandPaletteSearch("reviews");
        cy.wait("@freshSearch");

        expectSearchResultItemNameContent({
          itemNames: [
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
            LAST_EDITED_BY_ADMIN_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });

        cy.findByTestId("last_edited_by-search-filter").click();

        H.popover().within(() => {
          cy.findByText("Robert Tableton").click();
          cy.findByText("Bobby Tables").click();
          cy.findByText("Apply").click();
        });
        cy.url().should("contain", `last_edited_by=${ADMIN_USER_ID}`);

        H.expectSearchResultContent({
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

        cy.intercept("GET", "/api/search?q=*").as("hydratedSearch");
        cy.visit(`/search?q=reviews&last_edited_by=${NORMAL_USER_ID}`);

        cy.wait("@hydratedSearch");

        cy.findByTestId("last_edited_by-search-filter").within(() => {
          cy.findByText("Robert Tableton").should("exist");
          cy.findByLabelText("close icon").should("exist");
        });

        H.expectSearchResultContent({
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
              timestamp: "Updated a few seconds ago by Robert Tableton",
              collection: "Our analytics",
            },
          ],
        });
      });

      it("should allow to remove a user from the `last_edited_by` filter, and remove the filter when `X` is clicked", () => {
        cy.visit(
          `/search?q=reviews&last_edited_by=${NORMAL_USER_ID}&last_edited_by=${ADMIN_USER_ID}`,
        );

        cy.wait("@search");

        H.expectSearchResultContent({
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
        H.popover().within(() => {
          // remove Robert Tableton from the last_edited_by filter
          cy.findByTestId("search-user-select-box")
            .findByText("Robert Tableton")
            .click();
          cy.findByText("Apply").click();
        });
        cy.url().should("not.contain", `last_edited_by=${NORMAL_USER_ID}`);

        H.expectSearchResultContent({
          expectedSearchResults: [
            {
              name: LAST_EDITED_BY_ADMIN_QUESTION.name,
              timestamp: "Updated a few seconds ago by you",
              collection: "Our analytics",
            },
          ],
        });

        cy.intercept("GET", "/api/search?q=*").as("hydratedSearch");
        cy.visit(
          `/search?q=reviews&last_edited_by=${NORMAL_USER_ID}&last_edited_by=${ADMIN_USER_ID}`,
        );
        cy.wait("@hydratedSearch");

        H.expectSearchResultContent({
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
        cy.url().should("not.contain", "last_edited_by");

        expectSearchResultItemNameContent({
          itemNames: [
            LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
            LAST_EDITED_BY_ADMIN_QUESTION.name,
            REVIEWS_TABLE_NAME,
          ],
        });
      });

      it("should allow non-admin users to see users and filter by last_edited_by", () => {
        ["normal", "sandboxed"].forEach((userType) => {
          cy.signIn(userType);
          cy.intercept("GET", "/api/search?q=*").as(`${userType}Search`);
          cy.visit("/");

          H.commandPaletteSearch("reviews");
          cy.wait(`@${userType}Search`);

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

          H.popover().within(() => {
            cy.findByText("Bobby Tables").click();
            cy.findByText("Apply").click();
          });
          cy.url().should("contain", "last_edited_by");

          H.expectSearchResultContent({
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

    it("should hydrate created_at and last_edited_at from the URL", () => {
      [
        { name: "created_at", query: "orders" },
        { name: "last_edited_at", query: "reviews" },
      ].forEach(({ name, query }) => {
        TEST_CREATED_AT_FILTERS.filter(
          ([, filter]) => filter !== "thisday",
        ).forEach(([label, filter]) => {
          cy.visit(`/search?q=${query}&${name}=${filter}`);
          cy.wait("@search");
          cy.findByTestId(`${name}-search-filter`).within(() => {
            cy.findByText(label).should("exist");
            cy.findByLabelText("close icon").should("exist");
          });
        });
      });
    });

    describe("last_edited_at filter", () => {
      describe("with an edited question", () => {
        beforeEach(() => {
          // We'll create a question as an admin user, then edit it as a normal user
          H.createQuestion(LAST_EDITED_BY_NORMAL_USER_QUESTION).then(
            ({ body: { id: questionId } }) => {
              cy.signOut();
              cy.signInAsNormalUser();
              cy.visit(`/question/${questionId}`);
              H.summarize();
              cy.findByTestId("sidebar-right").findByText("Done").click();
              cy.findByTestId("qb-header-action-panel")
                .findByText("Save")
                .click();
              cy.findByTestId("save-question-modal").findByText("Save").click();
              cy.signOut();
              cy.signInAsAdmin();
            },
          );
        });

        // we can only test the 'today' filter since we currently
        // can't edit the last_edited_at column of a question in our database
        it("should filter results by Today (last_edited_at=thisday), and remove the filter when `X` is clicked", () => {
          cy.visit("/search?q=Reviews");

          expectSearchResultItemNameContent({
            itemNames: [
              REVIEWS_TABLE_NAME,
              LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
            ],
          });

          cy.findByTestId("last_edited_at-search-filter").click();
          H.popover().within(() => {
            cy.findByText("Today").click();
          });
          cy.url().should("contain", "last_edited_at=thisday");
          cy.findByTestId("last_edited_at-search-filter").within(() => {
            cy.findByText("Today").should("exist");
            cy.findByLabelText("close icon").should("exist");
          });

          H.expectSearchResultContent({
            expectedSearchResults: [
              {
                name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
                collection: "Our analytics",
                timestamp: "Updated a few seconds ago by Robert Tableton",
              },
            ],
          });

          cy.intercept("GET", "/api/search?q=*").as("hydratedSearch");
          cy.visit("/search?q=Reviews&last_edited_at=thisday");
          cy.wait("@hydratedSearch");

          H.expectSearchResultContent({
            expectedSearchResults: [
              {
                name: LAST_EDITED_BY_NORMAL_USER_QUESTION.name,
                collection: "Our analytics",
                timestamp: "Updated a few seconds ago by Robert Tableton",
              },
            ],
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
    });

    describe("verified filter", () => {
      beforeEach(() => {
        H.activateToken("pro-self-hosted");
        H.createModerationReview({
          status: "verified",
          moderated_item_type: "card",
          moderated_item_id: ORDERS_COUNT_QUESTION_ID,
        });
      });

      it("should filter results by verified items, hydrate the filter from the URL, and turn it off", () => {
        cy.visit("/");

        H.commandPaletteSearch("e");
        cy.wait("@search");

        cy.intercept("GET", "/api/search?q=*verified=true*").as(
          "verifiedSearch",
        );
        cy.findByTestId("verified-search-filter")
          .findByLabelText("Verified items only")
          .click();

        cy.url().should("include", "verified=true");
        cy.wait("@verifiedSearch");

        cy.findAllByTestId("search-result-item").each((result) => {
          cy.wrap(result).within(() => {
            cy.findByLabelText("verified_filled icon").should("exist");
          });
        });

        cy.intercept("GET", "/api/search?q=*").as("hydratedSearch");
        cy.visit("/search?q=e&verified=true");

        cy.wait("@hydratedSearch");

        cy.findByTestId("search-app").within(() => {
          cy.findByText('Results for "e"').should("exist");
        });

        cy.findAllByTestId("search-result-item").each((result) => {
          cy.wrap(result).within(() => {
            cy.findByLabelText("verified_filled icon").should("exist");
          });
        });

        cy.intercept("GET", "/api/search?q=*").as("unverifiedSearch");
        cy.findByTestId("verified-search-filter")
          .findByLabelText("Verified items only")
          .click();
        cy.url().should("not.include", "verified=true");
        cy.wait("@unverifiedSearch");

        let verifiedElementCount = 0;
        let unverifiedElementCount = 0;
        cy.findAllByTestId("search-result-item")
          .each(($el) => {
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
        H.createNativeQuestion({
          name: TEST_NATIVE_QUESTION_NAME,
          native: {
            query: "SELECT 'reviews';",
          },
        });

        H.createNativeQuestion({
          name: "Native Query",
          native: {
            query: `SELECT '${TEST_NATIVE_QUESTION_NAME}';`,
          },
        });
      });

      it("should include results that contain native query data when the toggle is on, and not include them when it is off", () => {
        cy.visit(`/search?q=${TEST_NATIVE_QUESTION_NAME}`);
        cy.wait("@search");

        expectSearchResultItemNameContent({
          itemNames: [TEST_NATIVE_QUESTION_NAME],
        });

        cy.findByTestId("search_native_query-search-filter")
          .findByLabelText("Search the contents of native queries")
          .click();

        cy.url().should("include", "search_native_query=true");

        expectSearchResultItemNameContent({
          itemNames: [TEST_NATIVE_QUESTION_NAME, "Native Query"],
        });

        cy.intercept("GET", "/api/search?q=*").as("hydratedSearch");
        cy.visit(
          `/search?q=${TEST_NATIVE_QUESTION_NAME}&search_native_query=true`,
        );
        cy.wait("@hydratedSearch");

        cy.findByTestId("search-app").within(() => {
          cy.findByText(`Results for "${TEST_NATIVE_QUESTION_NAME}"`).should(
            "exist",
          );
        });

        expectSearchResultItemNameContent({
          itemNames: [TEST_NATIVE_QUESTION_NAME, "Native Query"],
        });

        cy.findByTestId("search_native_query-search-filter")
          .findByLabelText("Search the contents of native queries")
          .click();
        cy.url().should("not.contain", "search_native_query");

        expectSearchResultItemNameContent({
          itemNames: [TEST_NATIVE_QUESTION_NAME],
        });
      });
    });

    describe("personal collection filter", () => {
      beforeEach(() => {
        cy.log("Create a question in admin's personal collection");
        H.createQuestion({
          name: "Admin Personal Question [keyword]",
          query: { "source-table": ORDERS_ID, limit: 1 },
          collection_id: ADMIN_PERSONAL_COLLECTION_ID,
        });

        cy.log("Create a question in normal user's personal collection");
        cy.signInAsNormalUser();
        H.createQuestion({
          name: "Normal User Personal Question [keyword]",
          query: { "source-table": ORDERS_ID, limit: 1 },
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        });
        cy.signInAsAdmin();
      });

      it("should include other users' personal collection items when filter is turned on, and hydrate the filter from the URL", () => {
        cy.visit("/search?q=keyword");
        cy.wait("@search");

        cy.log("Should only see own personal items when filter is off");
        expectSearchResultItemNameContent({
          itemNames: ["Admin Personal Question [keyword]"],
        });

        cy.log("Turn on personal collection filter");
        cy.findByTestId("filter_items_in_personal_collection-search-filter")
          .findByRole("switch")
          .should("not.be.checked");
        cy.findByTestId("filter_items_in_personal_collection-search-filter")
          .click()
          .findByRole("switch")
          .should("be.checked");

        cy.url().should("contain", "filter_items_in_personal_collection=all");

        cy.log("Should see own and other users' items when filter is on");
        expectSearchResultItemNameContent({
          itemNames: [
            "Admin Personal Question [keyword]",
            "Normal User Personal Question [keyword]",
          ],
        });

        cy.log("Hydrate the filter from the URL");
        cy.intercept("GET", "/api/search?q=*").as("hydratedSearch");
        cy.visit("/search?q=keyword&filter_items_in_personal_collection=all");
        cy.wait("@hydratedSearch");

        cy.findByTestId("filter_items_in_personal_collection-search-filter")
          .findByRole("switch")
          .should("be.checked");

        expectSearchResultItemNameContent({
          itemNames: [
            "Admin Personal Question [keyword]",
            "Normal User Personal Question [keyword]",
          ],
        });
      });

      it("should not be exposed to non-admins", () => {
        cy.signInAsNormalUser();
        cy.visit("/search?q=keyword&filter_items_in_personal_collection=all");
        cy.wait("@search");
        expectSearchResultItemNameContent({
          itemNames: ["Normal User Personal Question [keyword]"],
        });
        cy.findByTestId("archived-search-filter").should("be.visible");
        cy.findByTestId(
          "filter_items_in_personal_collection-search-filter",
        ).should("not.exist");
      });
    });

    describe("trashed items filter", () => {
      it("should only show items in the trash", () => {
        cy.visit("/search?q=First");
        cy.findAllByTestId("search-result-item").should("have.length", 1);
        cy.findByTestId("search-result-item")
          .findByText("Collection")
          .should("exist");

        cy.findByTestId("archived-search-filter")
          .findByLabelText("Search items in trash")
          .click();
        cy.url().should("include", "archived=true");
        cy.findByTestId("search-app")
          .findByText("Didn't find anything")
          .should("be.visible");
        cy.findAllByTestId("search-result-item").should("not.exist");

        H.archiveCollection(FIRST_COLLECTION_ID);
        cy.reload();
        cy.findAllByTestId("search-result-item").should("have.length", 1);
        // TODO: eventually re-enable when FE can properly identify the parent collection
        // cy.findByTestId("search-result-item")
        //   .findByText("Trash")
        //   .should("exist");
      });
    });

    it("should hydrate search from the URL and persist filters when the user changes the text query", () => {
      cy.visit("/search?q=orders");
      cy.wait("@search");
      cy.findByTestId("search-app")
        .findByText('Results for "orders"')
        .should("exist");

      // add created_by filter
      cy.findByTestId("created_by-search-filter").click();
      H.popover().within(() => {
        cy.findByText("Bobby Tables").click();
        cy.findByText("Apply").click();
      });

      // add last_edited_by filter
      cy.findByTestId("last_edited_by-search-filter").click();
      H.popover().within(() => {
        cy.findByText("Bobby Tables").click();
        cy.findByText("Apply").click();
      });

      // add type filter
      cy.findByTestId("type-search-filter").click();
      H.popover().within(() => {
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

      H.commandPaletteSearch("count");

      cy.findByTestId("search-app")
        .findByText('Results for "count"')
        .should("exist");
      cy.location("search")
        .should("contain", "q=count")
        .and("contain", `created_by=${ADMIN_USER_ID}`)
        .and("contain", `last_edited_by=${ADMIN_USER_ID}`)
        .and("contain", "type=card");
      cy.findByTestId("created_by-search-filter")
        .findByText("Bobby Tables")
        .should("exist");
      cy.findByTestId("last_edited_by-search-filter")
        .findByText("Bobby Tables")
        .should("exist");
      cy.findByTestId("type-search-filter")
        .findByText("Question")
        .should("exist");

      expectSearchResultItemNameContent({
        itemNames: [
          "Orders, Count",
          "Orders, Count, Grouped by Created At (year)",
        ],
      });
    });
  });
});

function expectSearchResultItemNameContent(
  { itemNames },
  { strict } = { strict: true },
) {
  cy.findAllByTestId("search-result-item-name").then(($searchResultLabel) => {
    const searchResultLabelList = $searchResultLabel
      .toArray()
      .map((el) => el.textContent);

    if (strict) {
      expect(searchResultLabelList).to.have.length(itemNames.length);
    }
    expect(searchResultLabelList).to.include.members(itemNames);
  });
}
