import { times } from "underscore";

import { PRODUCTS_AVERAGE_BY_CATEGORY } from "e2e/support/test-visualizer-data";

const { H } = cy;

describe("Links in documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("smart links", () => {
    beforeEach(() => {
      H.createQuestion(PRODUCTS_AVERAGE_BY_CATEGORY, { wrapId: true });
    });

    it("should display the most up-to-date title for the entity it references, or 'No access' without permission", () => {
      cy.get("@questionId").then((questionId) => {
        H.createDocument({
          name: "Document with SmartLinks",
          document: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "See " },
                  {
                    type: "smartLink",
                    attrs: {
                      entityId: questionId,
                      model: "card",
                      label: "cached name",
                    },
                  },
                  { type: "text", text: "." },
                ],
              },
            ],
          },
          idAlias: "documentId",
        });
      });

      H.visitDocument("@documentId");

      H.documentContent().should(
        "contain.text",
        `See ${PRODUCTS_AVERAGE_BY_CATEGORY.name}`,
      );

      H.documentContent()
        .findByRole("link", {
          name: new RegExp(PRODUCTS_AVERAGE_BY_CATEGORY.name),
        })
        .should("exist");

      H.documentContent()
        .findByRole("link", { name: /cached name/ })
        .should("not.exist");

      cy.log("Display 'No access' without permission to the linked entity");
      cy.get("@questionId").then((questionId) => {
        cy.intercept("GET", `/api/card/${questionId}`, {
          statusCode: 403,
        });
      });
      H.visitDocument("@documentId");

      H.documentContent().should("contain.text", "See No access");
      H.documentContent()
        .findByText("No access")
        .should("exist")
        .icon("eye_crossed_out")
        .should("exist");
    });

    it("should convert markdown links, add, edit and remove links via the floating menu, and add smart links via the suggestion and mention menus", () => {
      cy.visit("/document/new");
      H.documentContent().click();

      cy.log("Convert a markdown link to a real link");
      H.addToDocument("Read [there](url.com).", false);
      H.documentContent()
        .findByRole("paragraph")
        .should("contain.text", "Read there.")
        .findByRole("link", { name: "there" })
        .should("exist");
      H.addToDocument("", true);

      cy.log("Add text and make a link");
      H.addToDocument("Click here", false);
      times("here".length, () => cy.realPress(["Shift", "{leftarrow}"]));
      H.documentFormattingMenu().findByRole("button", { name: /link/ }).click();
      cy.realType("test.com{enter}");

      cy.log("Assert link exists with correct href");
      H.documentContent()
        .findByRole("link", { name: "here" })
        .invoke("attr", "href")
        .then((href) => expect(href).to.equal("https://test.com"));

      cy.log("Edit link url");
      H.documentContent().findByRole("link", { name: "here" }).realHover();
      cy.icon("pencil").click();
      H.documentFormattingMenu().find("input").should("be.focused");
      cy.realType("url.com/a/1?k=v");
      H.documentFormattingMenu().icon("check").click();

      cy.log("Assert link still exists, has updated href");
      H.documentContent()
        .findByRole("link", { name: "here" })
        .invoke("attr", "href")
        .then((href) => expect(href).to.equal("https://url.com/a/1?k=v"));

      cy.log("Remove link");
      H.documentContent().findByRole("link", { name: "here" }).realHover();
      cy.icon("pencil").click();
      cy.findByTestId("document-formatting-menu").icon("trash").click();

      cy.log("Assert link is unlinked");
      H.documentContent()
        .contains("p", "Click here")
        .findByRole("link", { name: "here" })
        .should("not.exist");

      cy.log("Add a smart link from the suggestion menu");
      H.documentContent().click();
      H.addToDocument("", true);
      cy.log("Trigger suggestion menu with /");
      H.addToDocument("/", false);

      cy.log("Select Link from the suggestion menu");
      H.commandSuggestionItem("Link").click();

      H.addToDocument(PRODUCTS_AVERAGE_BY_CATEGORY.name.substring(0, 5), false);

      cy.log("Select the first item from the list");
      H.commandSuggestionDialog().findAllByRole("option").first().click();

      cy.log("Verify smart link was added");
      H.documentContent()
        .findByRole("link", {
          name: new RegExp(PRODUCTS_AVERAGE_BY_CATEGORY.name),
        })
        .should("exist");

      cy.log("Add a smart link using 'Browse all' option in suggestion menu");
      H.addToDocument("", true);
      openLinkSuggestionBrowseAllPicker();

      H.modal().within(() => {
        cy.findByText("Choose an item to link").should("be.visible");

        cy.findByText("Our analytics").click();
        cy.findByText("Orders in a dashboard").click();
        cy.button("Select").should("be.visible").and("be.enabled").click();
      });

      cy.log("Verify dashboard smart link was added");
      H.documentContent()
        .findByRole("link", {
          name: new RegExp("Orders in a dashboard"),
        })
        .should("exist");

      cy.log("Add collection link");
      H.addToDocument("", true);

      openLinkSuggestionBrowseAllPicker();
      H.modal().within(() => {
        cy.findByText("All personal collections").click();

        cy.log(
          "Verify that synthetic collections are not available for using as links",
        );
        cy.button("Select").should("be.visible").and("be.disabled");

        cy.findAllByText("Bobby Tables's Personal Collection")
          .should("have.length", 2)
          .last()
          .click();
        cy.button("Select").should("be.visible").and("be.enabled").click();
      });

      cy.log("Verify collection smart link was added");
      H.documentContent()
        .findByRole("link", {
          name: new RegExp("Bobby Tables's Personal Collection"),
        })
        .should("exist");

      cy.log("Add a smart link using 'Browse all' option in mention menu");
      H.addToDocument("", true);
      openLinkMentionMenuBrowseAllPicker();

      H.modal().within(() => {
        cy.findByText("Choose an item to link").should("be.visible");

        H.pickEntity({ path: ["Databases", "Sample Database", "Products"] });
        cy.button("Select").should("be.visible").and("be.enabled").click();
      });

      cy.log("Verify table smart link was added");
      H.documentContent()
        .findByRole("link", {
          name: /Products$/,
        })
        .should("exist");
    });
  });
});

function openLinkSuggestionBrowseAllPicker() {
  H.documentContent().click();

  cy.log("Trigger suggestion menu with /");
  H.addToDocument("/", false);

  cy.log("Select Link from the suggestion menu");
  H.commandSuggestionItem("Link").click();

  H.commandSuggestionItem(/Browse all/).click();
}

function openLinkMentionMenuBrowseAllPicker() {
  H.documentContent().click();

  cy.log("Trigger mention menu with @");
  H.addToDocument("@", false);

  H.documentMentionItem(/Browse all/).click();
}
