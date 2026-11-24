const { H } = cy;

describe("scenarios > data studio > snippets", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    // TODO: We likely shouldn't need to do this to access the data studio library page
    H.createLibrary();

    cy.intercept("POST", "/api/native-query-snippet").as("createSnippet");
    cy.intercept("PUT", "/api/native-query-snippet/*").as("updateSnippet");
  });

  describe("editing", () => {
    it("should save content, name and description edits", () => {
      H.createSnippet({
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      H.DataStudio.Snippets.visitList();

      H.DataStudio.Library.libraryPage().findByText("Test snippet").click();

      cy.log("Edit content, then the name and the description");
      H.DataStudio.Snippets.editor.type(" WHERE id = 1");
      cy.findByPlaceholderText("Name").type("1").blur();
      cy.wait("@updateSnippet");
      H.DataStudio.Snippets.descriptionInput().type("desc").blur();
      cy.wait("@updateSnippet");

      cy.log("Save the content");
      H.DataStudio.Snippets.saveButton().click();
      cy.wait("@updateSnippet");

      cy.reload();
      H.DataStudio.Snippets.editor
        .get()
        .should("contain.text", "SELECT * FROM orders WHERE id = 1");
      cy.findByPlaceholderText("Name").should("have.value", "Test snippet1");
      H.DataStudio.Snippets.editPage().findByText("desc").should("be.visible");
    });
  });

  describe("archiving", () => {
    it("should archive and unarchive a snippet", () => {
      H.createSnippet({
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      H.DataStudio.Snippets.visitList();

      H.DataStudio.Library.libraryPage().findByText("Test snippet").click();

      cy.log("Archive the snippet");
      cy.findByTestId("snippet-header")
        .findByRole("button", { name: /Snippet menu options/ })
        .click();
      H.popover().findByText("Archive").click();

      H.modal().within(() => {
        cy.findByText("Archive snippet?").should("be.visible");
        cy.button("Archive").click();
        cy.wait("@updateSnippet");
      });

      H.DataStudio.Library.emptyStateRow(
        "Reusable bits of code that save your time",
      ).should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Test snippet")
        .should("not.exist");

      cy.log("Unarchive the snippet");
      H.DataStudio.Library.libraryPage()
        .findByRole("button", { name: "Snippet options" })
        .click();

      H.popover()
        .findByText(/View archived snippets/)
        .click();

      cy.url().should("include", "/snippets/archived");

      H.DataStudio.Snippets.archivedPage()
        .findByText("Test snippet")
        .should("be.visible");

      H.DataStudio.Snippets.archivedPage()
        .findByRole("button", { name: "Unarchive snippet" })
        .click();

      cy.wait("@updateSnippet");

      H.DataStudio.Snippets.archivedPage()
        .findByText("Test snippet")
        .should("not.exist");

      H.DataStudio.Snippets.visitList();

      H.DataStudio.Library.libraryPage()
        .findByText("Test snippet")
        .should("be.visible");
    });
  });

  describe("snippet folders", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/collection").as("createCollection");
    });

    it("should create a snippet, then a folder and a snippet inside it", () => {
      H.DataStudio.Snippets.visitList();

      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Snippet").click();

      H.DataStudio.Snippets.newPage().should("be.visible");
      H.DataStudio.Snippets.saveButton().should("be.disabled");

      H.DataStudio.Snippets.editor.type("SELECT * FROM orders");
      H.DataStudio.Snippets.saveButton().should("be.enabled");

      H.DataStudio.Snippets.nameInput().clear().type("Test snippet");
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

      H.DataStudio.nav().findByRole("link", { name: "SQL snippets" }).click();
      H.DataStudio.Library.libraryPage()
        .findByText("Test snippet")
        .should("be.visible");

      cy.log("Create a folder and a snippet inside it");
      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Folder").click();

      H.modal().within(() => {
        cy.findByLabelText("Name").type("Test Folder");
        cy.findByLabelText("Description").type("Folder for test snippets");
        cy.findByTestId("collection-picker-button").click();
      });
      H.entityPickerModal().within(() => {
        cy.findByText("SQL Snippets").click();
        cy.button("Select").click();
      });
      H.modal().within(() => {
        cy.button("Create").click();
        cy.wait("@createCollection");
      });

      H.DataStudio.Snippets.visitList();
      H.DataStudio.Library.libraryPage()
        .findByText("Test Folder")
        .should("be.visible");

      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Snippet").click();

      H.DataStudio.Snippets.nameInput().clear().type("Folder snippet");
      H.DataStudio.Snippets.editor.type("SELECT 1");
      H.DataStudio.Snippets.saveButton().click();

      H.modal().within(() => {
        cy.findByText("Test Folder").click();
        cy.button("Select").click();
      });

      cy.wait("@createSnippet");

      H.DataStudio.breadcrumbs()
        .findByRole("link", { name: /Test Folder/ })
        .click();
      H.DataStudio.Library.libraryPage()
        .findByText("Folder snippet")
        .should("be.visible");
    });
  });
});
