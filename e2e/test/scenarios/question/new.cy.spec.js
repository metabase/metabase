import {
  openOrdersTable,
  popover,
  restore,
  visualize,
  startNewQuestion,
  visitQuestionAdhoc,
  getCollectionIdFromSlug,
  saveQuestion,
  getPersonalCollectionName,
  visitCollection,
  modal,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID, USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// test various entry points into the query builder

describe("scenarios > question > new", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("data picker", () => {
    it("data selector popover should not be too small (metabase#15591)", () => {
      // Add 10 more databases
      for (let i = 0; i < 10; i++) {
        cy.addH2SampleDatabase({ name: "Sample" + i });
      }

      startNewQuestion();

      cy.contains("Pick your starting data");
      cy.findByText("Sample3").isVisibleInPopover();
    });

    it("new question data picker search should work for both saved questions and database tables", () => {
      cy.intercept("GET", "/api/search?q=*", cy.spy().as("searchQuery")).as(
        "search",
      );

      startNewQuestion();

      cy.get(".List-section")
        .should("have.length", 2)
        .and("contain", "Sample Database")
        .and("contain", "Saved Questions");

      // should not trigger search for an empty string
      cy.findByPlaceholderText("Search for a table…").type("  ").blur();
      cy.findByPlaceholderText("Search for a table…").type("ord");
      cy.wait("@search");
      cy.get("@searchQuery").should("have.been.calledOnce");

      // Search results include both saved questions and database tables
      cy.findAllByTestId("search-result-item").should(
        "have.length.at.least",
        4,
      );

      cy.contains("Saved question in Our analytics");
      cy.findAllByRole("link", { name: "Our analytics" })
        .should("have.attr", "href")
        .and("eq", "/collection/root");

      cy.contains("Table in Sample Database");
      cy.findAllByRole("link", { name: "Sample Database" })
        .should("have.attr", "href")
        .and("eq", `/browse/${SAMPLE_DB_ID}-sample-database`);

      // Discarding the search query should take us back to the original selector
      // that starts with the list of databases and saved questions
      cy.findByPlaceholderText("Search for a table…");
      cy.findByTestId("input-reset-button").click();

      cy.findByText("Saved Questions").click();

      // Search is now scoped to questions only
      cy.findByPlaceholderText("Search for a question…");
      cy.findByTestId("select-list")
        .as("rightSide")
        // should display the collection tree on the left side
        .should("contain", "Orders")
        .and("contain", "Orders, Count");

      cy.get("@rightSide")
        .siblings()
        .should("have.length", 1)
        .as("leftSide")
        // should display the collection tree on the left side
        .should("contain", "Our analytics");

      cy.findByText("Orders, Count").click();
      cy.findByText("Orders").should("not.exist");
      visualize();
      cy.findByText("18,760");
      // should reopen saved question picker after returning back to editor mode
      cy.icon("notebook").click();
      cy.findByTestId("data-step-cell").contains("Orders, Count").click();
      // It is now possible to choose another saved question
      cy.findByText("Orders");
      cy.findByText("Saved Questions").click();
      popover().contains("Sample Database").click();
      cy.findByText("Products").click();
      cy.findByTestId("data-step-cell").contains("Products");
      visualize();
      cy.findByText("Rustic Paper Wallet");
    });

    it("should suggest questions saved in collections with colon in their name (metabase#14287)", () => {
      cy.request("POST", "/api/collection", {
        name: "foo:bar",
        color: "#509EE3",
        parent_id: null,
      }).then(({ body: { id: COLLECTION_ID } }) => {
        // Move question #1 ("Orders") to newly created collection
        cy.request("PUT", "/api/card/1", {
          collection_id: COLLECTION_ID,
        });
        // Sanity check: make sure Orders is indeed inside new collection
        cy.visit(`/collection/${COLLECTION_ID}`);
        cy.findByText("Orders");
      });

      startNewQuestion();
      popover().within(() => {
        cy.findByText("Saved Questions").click();
        // Note: collection name's first letter is capitalized
        cy.findByText(/foo:bar/i).click();
        cy.findByText("Orders");
      });
    });

    it("'Saved Questions' prompt should respect nested collections structure (metabase#14178)", () => {
      getCollectionIdFromSlug("second_collection", id => {
        // Move first question in a DB snapshot ("Orders") to a "Second collection"
        cy.request("PUT", "/api/card/1", {
          collection_id: id,
        });
      });

      startNewQuestion();

      popover().within(() => {
        cy.findByText("Saved Questions").click();
        cy.findByText("First collection");
        cy.findByText("Second collection").should("not.exist");
      });
    });

    it("should be possible to create a question based on a question in another user personal collection", () => {
      cy.signOut();
      cy.signIn("nocollection");
      startNewQuestion();
      popover().findByText("Orders").click();
      visualize();
      saveQuestion("Personal question");

      cy.signOut();
      cy.signInAsAdmin();
      startNewQuestion();
      popover().within(() => {
        cy.findByText("Saved Questions").click();
        cy.findByText("All personal collections").click();
        cy.findByText(getPersonalCollectionName(USERS.normal)).should(
          "not.exist",
        );
        cy.findByText(getPersonalCollectionName(USERS.nocollection)).click();
        cy.findByText("Personal question").click();
      });
      visualize();
    });
  });

  it("should remove `/notebook` from URL when converting question to SQL/Native (metabase#12651)", () => {
    openOrdersTable();

    cy.url().should("include", "question#");
    // Isolate icons within "QueryBuilder" scope because there is also `.Icon-sql` in top navigation
    cy.get(".QueryBuilder .Icon-notebook").click();
    cy.url().should("include", "question/notebook#");
    cy.get(".QueryBuilder .Icon-sql").click();
    cy.findByText("Convert this question to SQL").click();
    cy.url().should("include", "question#");
  });

  it("composite keys should act as filters on click (metabase#13717)", () => {
    cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
      semantic_type: "type/PK",
    });

    openOrdersTable();

    cy.get(".TableInteractive-cellWrapper--lastColumn") // Quantity (last in the default order for Sample Database)
      .eq(1) // first table body cell
      .should("contain", "2") // quantity for order ID#1
      .click();
    cy.wait("@dataset");

    cy.get("#main-data-grid .TableInteractive-cellWrapper--firstColumn").should(
      "have.length.gt",
      1,
    );

    cy.log(
      "**Reported at v0.34.3 - v0.37.0.2 / probably was always like this**",
    );
    cy.log(
      "**It should display the table with all orders with the selected quantity.**",
    );
    cy.get(".TableInteractive");

    cy.get(".TableInteractive-cellWrapper--firstColumn") // ID (first in the default order for Sample Database)
      .eq(1) // first table body cell
      .should("contain", 1)
      .click();
    cy.wait("@dataset");

    cy.log("only one row should appear after filtering by ID");
    cy.get("#main-data-grid .TableInteractive-cellWrapper--firstColumn").should(
      "have.length",
      1,
    );
  });

  it("should handle ad-hoc question with old syntax (metabase#15372)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: ["=", ["field-id", ORDERS.USER_ID], 1],
        },
        database: SAMPLE_DB_ID,
      },
    });

    cy.findByText("User ID is 1");
    cy.findByText("37.65");
  });

  it("should suggest the currently viewed collection when saving question", () => {
    getCollectionIdFromSlug("third_collection", THIRD_COLLECTION_ID => {
      visitCollection(THIRD_COLLECTION_ID);
    });

    cy.findByTestId("app-bar").within(() => {
      cy.findByText("New").click();
    });

    popover().findByText("Question").click();

    popover().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });

    cy.findByTestId("qb-header").within(() => {
      cy.findByText("Save").click();
    });
    modal().within(() => {
      cy.findByTestId("select-button").should("have.text", "Third collection");
    });
  });
});
