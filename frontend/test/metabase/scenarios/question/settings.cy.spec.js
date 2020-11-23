import { signInAsAdmin, restore, openOrdersTable } from "__support__/cypress";

describe("scenarios > question > settings", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  describe("column settings", () => {
    it("should allow you to remove a column and add two foreign columns", () => {
      // oddly specific test inspired by https://github.com/metabase/metabase/issues/11499

      // get a really wide window, so we don't need to mess with scrolling the table horizontally
      cy.viewport(1600, 800);

      openOrdersTable();
      cy.contains("Settings").click();

      // wait for settings sidebar to open
      cy.get(".border-right.overflow-x-hidden")
        .invoke("width")
        .should("be.gt", 350);

      cy.contains("Table options")
        .parents(".scroll-y")
        .first()
        .as("tableOptions");

      // remove Total column
      cy.get("@tableOptions")
        .contains("Total")
        .scrollIntoView()
        .nextAll(".Icon-close")
        .click();

      // Add people.category
      cy.get("@tableOptions")
        .contains("Category")
        .scrollIntoView()
        .nextAll(".Icon-add")
        .click();

      // wait a Category value to appear in the table, so we know the query completed
      cy.contains("Widget");

      // Add people.ean
      cy.get("@tableOptions")
        .contains("Ean")
        .scrollIntoView()
        .nextAll(".Icon-add")
        .click();

      // wait a Ean value to appear in the table, so we know the query completed
      cy.contains("8833419218504");

      // confirm that the table contains the right columns
      cy.get(".Visualization .TableInteractive").as("table");
      cy.get("@table").contains("Product → Category");
      cy.get("@table").contains("Product → Ean");
      cy.get("@table")
        .contains("Total")
        .should("not.exist");
    });
  });

  describe("resetting state", () => {
    it("should reset modal state when navigating away", () => {
      // create a question and add it to a modal
      openOrdersTable();

      cy.contains("Save").click();
      cy.get(".ModalContent")
        .contains("button", "Save")
        .click();
      cy.contains("Yes please!").click();
      cy.contains("Orders in a dashboard").click();

      // create a new question to see if the "add to a dashboard" modal is still there
      cy.contains("Browse Data").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();

      // This next assertion might not catch bugs where the modal displays after
      // a quick delay. With the previous presentation of this bug, the modal
      // was immediately visible, so I'm not going to add any waits.
      cy.contains("Add this question to a dashboard").should("not.exist");
    });
  });
});
