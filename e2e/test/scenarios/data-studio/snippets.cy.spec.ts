const { H } = cy;

describe("scenarios > data studio > snippets", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    // TODO: We likely shouldn't need to do this to access the data studio library page
    H.createLibrary();

    cy.intercept("POST", "/api/native-query-snippet").as("createSnippet");
    cy.intercept("PUT", "/api/native-query-snippet/*").as("updateSnippet");
  });

  describe("creation", () => {
    it("should create a new snippet with proper validation", () => {
      H.DataStudio.Library.visit();

      H.DataStudio.Library.newButton().click();
      H.popover().findByText("New snippet").click();

      H.DataStudio.Snippets.newPage().should("be.visible");
      H.DataStudio.Snippets.saveButton().should("be.disabled");

      H.DataStudio.Snippets.editor.type("SELECT * FROM orders");
      H.DataStudio.Snippets.saveButton().should("be.disabled");

      H.DataStudio.Snippets.nameInput().type("Test snippet");
      H.DataStudio.Snippets.saveButton().should("be.enabled");

      H.DataStudio.Snippets.descriptionInput().type(
        "This is a test snippet description",
      );
      H.DataStudio.Snippets.saveButton().click();

      H.modal().within(() => {
        cy.findByText("Select a folder for your snippet").should("be.visible");
        cy.button("Select").click();
      });

      cy.wait("@createSnippet");

      H.DataStudio.Snippets.editPage().should("be.visible");

      H.DataStudio.Snippets.editPage().within(() => {
        cy.findByText(/by Bobby Tables/).should("be.visible");
      });

      H.DataStudio.nav().findByRole("link", { name: "Library" }).click();
      H.DataStudio.Library.libraryPage()
        .findByText("Test snippet")
        .should("be.visible");
    });
  });

  describe("editing", () => {
    it("should be able to edit snippet content", () => {
      H.createSnippet({
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      H.DataStudio.Library.visit();

      H.DataStudio.Library.libraryPage().findByText("Test snippet").click();

      H.DataStudio.Snippets.editPage().should("be.visible");

      H.DataStudio.Snippets.editor.type(" WHERE id = 1");

      H.DataStudio.Snippets.saveButton().should("be.enabled").click();
      cy.wait("@updateSnippet");

      cy.reload();
      H.DataStudio.Snippets.editor
        .get()
        .should("contain.text", "SELECT * FROM orders WHERE id = 1");
    });

    it("should be able to cancel editing", () => {
      H.createSnippet({
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      H.DataStudio.Library.visit();

      H.DataStudio.Library.libraryPage().findByText("Test snippet").click();

      H.DataStudio.Snippets.editor.type(" WHERE id = 1");

      H.DataStudio.Snippets.cancelButton().click();
      H.DataStudio.Snippets.editor
        .get()
        .should("not.contain.text", "SELECT * FROM orders WHERE id = 1");
      H.DataStudio.Snippets.editor
        .get()
        .should("contain.text", "SELECT * FROM orders");
    });

    it("should show unsaved changes warning when navigating away", () => {
      H.createSnippet({
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      H.DataStudio.Library.visit();

      H.DataStudio.Library.libraryPage().findByText("Test snippet").click();

      H.DataStudio.Snippets.editor.type(" WHERE id = 1");

      H.DataStudio.nav().findByRole("link", { name: "Glossary" }).click();

      H.modal().within(() => {
        cy.findByText("Discard your changes?").should("be.visible");
        cy.button("Cancel").click();
      });

      H.DataStudio.Snippets.editPage().should("be.visible");
    });
  });

  describe("description", () => {
    it("should support markdown in description", () => {
      H.createSnippet({
        name: "Test snippet",
        content: "SELECT * FROM orders",
        description: "**Bold text** and *italic text*",
      });

      H.DataStudio.Library.visit();

      H.DataStudio.Library.libraryPage().findByText("Test snippet").click();
      H.DataStudio.Snippets.editPage().within(() => {
        cy.findByText("Bold text").should("have.css", "font-weight", "700");
        cy.findByText("italic text").should("have.css", "font-style", "italic");
      });
    });
  });

  describe("deletion", () => {
    it("should be able to delete a snippet", () => {
      H.createSnippet({
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      H.DataStudio.Library.visit();

      H.DataStudio.Library.libraryPage().findByText("Test snippet").click();

      cy.findByTestId("snippet-header").findByRole("button").click();
      H.popover().findByText("Delete").click();

      H.modal().within(() => {
        cy.findByText("Delete snippet?").should("be.visible");
        cy.button("Delete").click();
        cy.wait("@updateSnippet");
      });

      H.DataStudio.Library.libraryPage()
        .findByText("Test snippet")
        .should("not.exist");
    });
  });

  describe("snippet folders", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/collection").as("createCollection");
      cy.intercept("PUT", "/api/collection/*").as("updateCollection");
      cy.intercept("DELETE", "/api/collection/*").as("deleteCollection");
    });

    it("should be able to create a folder and snippet inside it", () => {
      H.DataStudio.Library.visit();

      H.DataStudio.Library.newButton().click();
      H.popover().findByText("New snippet folder").click();

      H.modal().within(() => {
        cy.findByLabelText("Give your folder a name").type("Test Folder");
        cy.findByLabelText("Add a description").type(
          "Folder for test snippets",
        );
        cy.button("Create").click();
        cy.wait("@createCollection");
      });

      H.DataStudio.Library.libraryPage()
        .findByText("Test Folder")
        .should("be.visible");

      H.DataStudio.Library.newButton().click();
      H.popover().findByText("New snippet").click();

      H.DataStudio.Snippets.nameInput().type("Folder snippet");
      H.DataStudio.Snippets.editor.type("SELECT 1");
      H.DataStudio.Snippets.saveButton().click();

      H.modal().within(() => {
        cy.findByText("Test Folder").click();
        cy.button("Select").click();
      });

      cy.wait("@createSnippet");

      H.DataStudio.nav().findByRole("link", { name: "Library" }).click();
      H.DataStudio.Library.libraryPage()
        .findByText("Folder snippet")
        .should("be.visible");
    });

    it("should be able to edit folder details", () => {
      H.createSnippetFolder({
        name: "Test Folder",
      });

      H.DataStudio.Library.visit();

      H.DataStudio.Library.result("Test Folder").icon("ellipsis").click();

      H.popover().findByText("Edit folder details").click();

      H.modal().within(() => {
        cy.findByLabelText("Give your folder a name")
          .clear()
          .type("Updated Folder");
        cy.button("Update").click();
        cy.wait("@updateCollection");
      });

      H.DataStudio.Library.libraryPage()
        .findByText("Updated Folder")
        .should("be.visible");
    });

    it("should be able to delete a folder", () => {
      H.createSnippetFolder({
        name: "Test Folder",
      });

      H.DataStudio.Library.visit();

      H.DataStudio.Library.result("Test Folder").icon("ellipsis").click();

      H.popover().findByText("Archive").click();

      cy.wait("@updateCollection");

      H.DataStudio.Library.libraryPage()
        .findByText("Test Folder")
        .should("not.exist");
    });
  });
});
