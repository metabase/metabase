import { times } from "underscore";

import { PRODUCTS_AVERAGE_BY_CATEGORY } from "e2e/support/test-visualizer-data";

const { H } = cy;

describe("Links in documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should convert markdown links and support adding, editing, and removing links via floating menu", () => {
    cy.visit("/document/new");
    H.documentContent().click();

    cy.log("Convert a markdown link to a real link");
    H.addToDocument("Read [there](url.com).");
    H.documentContent()
      .should("contain.text", "Read there.")
      .findByRole("link", { name: "there" })
      .should("be.visible");

    cy.log("Add text and make a link");
    H.addToDocument("Click here", false);
    times("here".length, () => cy.realPress(["Shift", "{leftarrow}"]));
    H.documentFormattingMenu().findByRole("button", { name: /link/ }).click();
    cy.realType("test.com{enter}");

    H.documentContent()
      .findByRole("link", { name: "here" })
      .should("have.attr", "href", "https://test.com");

    cy.log("Edit link url");
    H.documentContent().findByRole("link", { name: "here" }).realHover();
    cy.icon("pencil").click();
    H.documentFormattingMenu().find("input").should("be.focused");
    cy.realType("url.com/a/1?k=v");
    H.documentFormattingMenu().icon("check").click();

    H.documentContent()
      .findByRole("link", { name: "here" })
      .should("have.attr", "href", "https://url.com/a/1?k=v");

    cy.log("Remove link");
    H.documentContent().findByRole("link", { name: "here" }).realHover();
    cy.icon("pencil").click();
    H.documentFormattingMenu().icon("trash").click();

    H.documentContent()
      .should("contain.text", "Click here")
      .findByRole("link", { name: "there" })
      .should("be.visible");
    H.documentContent()
      .findByRole("link", { name: "here" })
      .should("not.exist");
  });

  it("should add smart links from the suggestion and mention menus", () => {
    H.createQuestion(PRODUCTS_AVERAGE_BY_CATEGORY);
    cy.visit("/document/new");
    H.documentContent().click();

    cy.log("Add a question link by searching in the suggestion menu");
    H.addToDocument("/", false);
    H.commandSuggestionItem("Link").click();
    H.addToDocument(PRODUCTS_AVERAGE_BY_CATEGORY.name.substring(0, 5), false);
    H.commandSuggestionDialog().findAllByRole("option").first().click();

    H.documentContent()
      .findByRole("link", {
        name: new RegExp(PRODUCTS_AVERAGE_BY_CATEGORY.name),
      })
      .should("be.visible");

    cy.log("Add a dashboard link via 'Browse all' in the suggestion menu");
    H.addToDocument("", true);
    openLinkSuggestionBrowseAllPicker();

    H.modal().within(() => {
      cy.findByText("Choose an item to link").should("be.visible");

      cy.findByText("Our analytics").click();
      cy.findByText("Orders in a dashboard").click();
      cy.button("Select").should("be.visible").and("be.enabled").click();
    });

    H.documentContent()
      .findByRole("link", { name: /Orders in a dashboard/ })
      .should("be.visible");

    cy.log("Add a collection link via 'Browse all' in the suggestion menu");
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

    H.documentContent()
      .findByRole("link", { name: /Bobby Tables's Personal Collection/ })
      .should("be.visible");

    cy.log("Add a table link via 'Browse all' in the mention menu");
    H.addToDocument("", true);
    openLinkMentionMenuBrowseAllPicker();

    H.modal().within(() => {
      cy.findByText("Choose an item to link").should("be.visible");

      H.pickEntity({ path: ["Databases", "Sample Database", "Products"] });
      cy.button("Select").should("be.visible").and("be.enabled").click();
    });

    H.documentContent()
      .findByRole("link", { name: /Products$/ })
      .should("be.visible");
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
