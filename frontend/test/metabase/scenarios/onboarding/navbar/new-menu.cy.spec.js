import {
  restore,
  popover,
  modal,
  startNewQuestion,
  getCollectionIdFromSlug,
} from "__support__/e2e/helpers";

describe("metabase > scenarios > navbar > new menu", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.visit("/");
    cy.findByText("New").click();
  });

  it("question item opens question notebook editor", () => {
    popover().within(() => {
      cy.findByText("Question").click();
    });

    cy.url("should.contain", "/question/notebook#");
  });

  it("question item opens SQL query editor", () => {
    popover().within(() => {
      cy.findByText("SQL query").click();
    });

    cy.url("should.contain", "/question#");
    cy.get(".ace_content");
  });

  it("collection opens modal and redirects to a created collection after saving", () => {
    popover().within(() => {
      cy.findByText("Collection").click();
    });

    modal().within(() => {
      cy.findByText("Our analytics");

      cy.findByLabelText("Name").type("Test collection");
      cy.findByLabelText("Description").type("Test collection description");

      cy.findByText("Create").click();
    });

    cy.findByTestId("collection-name-heading").should(
      "have.text",
      "Test collection",
    );
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
});
