import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("should allow you to create a new document from the new button and save", () => {
    cy.visit("/");

    H.newButton("Document").click();

    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.focused")
      .type("Test Document");

    H.documentContent().type("This is a paragraph\nAnd this is another");

    cy.findByRole("button", { name: "Save" }).click();

    H.entityPickerModalTab("Collections").click();
    H.entityPickerModalItem(0, "Our analytics").should(
      "have.attr",
      "data-active",
      "true",
    );
    H.entityPickerModalItem(1, "First collection").click();
    H.entityPickerModal().findByRole("button", { name: "Select" }).click();

    H.appBar()
      .findByRole("link", { name: /First collection/ })
      .click();

    H.collectionTable()
      .findByRole("link", { name: "Test Document" })
      .should("exist");

    H.openCollectionItemMenu("Test Document");

    H.popover().findByText("Move").click();

    H.entityPickerModalTab("Collections").click();
    H.entityPickerModalItem(0, "Our analytics")
      .should("have.attr", "data-active", "true")
      .click();
    H.entityPickerModal().findByRole("button", { name: "Move" }).click();
  });

  describe("document editing", () => {
    beforeEach(() => {
      H.createDocument({
        name: "Foo Document",
        document: {
          content: [],
          type: "doc",
        },
        collection_id: null,
      }).then((data) => {
        cy.visit(`/document/${data.body.id}`);
      });
    });

    it("should support typing with a markdown syntax", () => {
      H.documentContent().click();

      H.addToDocument("# This is a heading level 1");
      H.addToDocument("## This is a heading level 2");
      H.addToDocument("### This is a heading level 3");
      H.addToDocument("#### This is a heading level 4");

      H.addToDocument("**Some Bold Text**");
      H.addToDocument("*Some Italic Text*");

      H.addToDocument("Lets start an unordered list");
      H.addToDocument("- First Item");
      H.addToDocument("Second Item");
      // New Line to break out of the list;
      H.addToDocument("");

      H.addToDocument("Lets start an ordered list");
      H.addToDocument("1. First Ordered Item");
      H.addToDocument("Second Ordered Item");
      // New Line to break out of the list;
      H.addToDocument("");

      H.addToDocument("http://metabase.com");

      H.documentContent().within(() => {
        cy.findByRole("heading", { name: "This is a heading level 1" }).should(
          "exist",
        );
        cy.findByRole("heading", { name: "This is a heading level 2" }).should(
          "exist",
        );
        cy.findByRole("heading", { name: "This is a heading level 3" }).should(
          "exist",
        );
        cy.findByRole("heading", { name: "This is a heading level 4" }).should(
          "exist",
        );
        cy.findByRole("strong").should("contain.text", "Some Bold Text");
        cy.findByRole("emphasis").should("contain.text", "Some Italic Text");

        cy.findAllByRole("list").should("have.length", 2);
        cy.findAllByRole("listitem")
          .should("contain.text", "First Item")
          .should("contain.text", "Second Item")
          .should("contain.text", "First Ordered Item")
          .should("contain.text", "Second Ordered Item");

        cy.findByRole("link", { name: "http://metabase.com" }).should("exist");
      });
    });

    it("should support adding cards and smart links to documents", () => {
      cy.intercept({
        method: "PUT",
        path: "/api/ee/document/*",
      }).as("documentUpdate");
      cy.intercept({
        method: "GET",
        path: "/api/ee/document/*",
      }).as("documentGet");

      //initial load
      cy.wait("@documentGet");
      H.documentContent().click();

      H.addToDocument("@ord", false);

      H.documentSuggestionDialog()
        .should("contain.text", "Orders, Count, Grouped by Created At (year)")
        .should("contain.text", "Orders, Count")
        .should("contain.text", "Orders Model");

      H.documentSuggestionItem(
        "Orders, Count, Grouped by Created At (year)",
      ).click();

      //Adding a new line
      H.addToDocument("");
      H.addToDocument("Adding a static link: /", false);
      H.commandSuggestionItem("Link to...").click();
      H.addToDocument("Ord", false);
      H.commandSuggestionItem("Orders, Count").click();
      H.addToDocument(" And continue typing", false);

      H.documentContent().within(() => {
        cy.findAllByTestId("document-card-embed")
          .should("have.length", 1)
          .should(
            "contain.text",
            "Orders, Count, Grouped by Created At (year)",
          );

        cy.findByRole("link", { name: /Orders, Count$/ }).should("exist");
      });

      cy.findByRole("button", { name: "Save" }).click();

      cy.wait("@documentUpdate");
      cy.wait("@documentGet");

      cy.findByTestId("document-card-embed")
        .findByText("Orders, Count, Grouped by Created At (year)")
        .click();

      cy.location("pathname").should(
        "not.include",
        ORDERS_BY_YEAR_QUESTION_ID.toString(),
      );
    });
  });
});
