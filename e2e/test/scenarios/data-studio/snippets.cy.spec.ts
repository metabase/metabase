const { H } = cy;

describe("scenarios > data studio > snippets", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    // TODO: We likely shouldn't need to do this to access the data studio library page
    H.createLibrary();

    cy.intercept("POST", "/api/native-query-snippet").as("createSnippet");
    cy.intercept("PUT", "/api/native-query-snippet/*").as("updateSnippet");
  });

  describe("creation", () => {
    it("should create a new snippet with proper validation", () => {
      H.DataStudio.Library.visit();

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

      H.DataStudio.Snippets.editPage()
        .findByText(/by Bobby Tables/)
        .should("be.visible");

      H.DataStudio.nav().findByRole("link", { name: "Semantic layer" }).click();
      H.DataStudio.Library.libraryPage()
        .findByText("Test snippet")
        .should("be.visible");
    });
  });

  describe("editing", () => {
    it("should edit snippet content, guard unsaved changes, and keep them across name and description edits", () => {
      H.createSnippet({
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      H.DataStudio.Library.visit();
      H.DataStudio.Library.libraryPage().findByText("Test snippet").click();
      H.DataStudio.Snippets.editPage().should("be.visible");

      cy.log("Cancel restores the saved content in the editor");
      H.DataStudio.Snippets.editor.type(" WHERE id = 2");
      H.DataStudio.Snippets.cancelButton().click();
      H.DataStudio.Snippets.editor.value().should("eq", "SELECT * FROM orders");

      H.DataStudio.Snippets.editor.type(" WHERE id = 1");

      cy.log("Edit the name and description while content is unsaved");
      H.DataStudio.Snippets.editPage()
        .findByPlaceholderText("Name")
        .type("1")
        .blur();
      H.undoToast().findByText("Snippet name updated").should("be.visible");
      H.undoToast().icon("close").click();

      H.DataStudio.Snippets.descriptionInput().type("desc").blur();
      H.undoToast()
        .findByText("Snippet description updated")
        .should("be.visible");
      H.undoToast().icon("close").click();

      H.DataStudio.Snippets.editor
        .value()
        .should("eq", "SELECT * FROM orders WHERE id = 1");

      cy.log("Navigating away with unsaved content asks to discard it");
      H.DataStudio.nav().findByRole("link", { name: "Glossary" }).click();
      H.modal().within(() => {
        cy.findByText("Discard your changes?").should("be.visible");
        cy.button("Cancel").click();
      });
      H.DataStudio.Snippets.editPage().should("be.visible");

      cy.log("Save keeps the name and description edits");
      H.DataStudio.Snippets.saveButton().should("be.enabled").click();
      H.undoToast().findByText("Snippet content updated").should("be.visible");
      H.DataStudio.Snippets.editPage()
        .findByPlaceholderText("Name")
        .should("have.value", "Test snippet1");
      H.DataStudio.Snippets.editPage().findByText("desc").should("be.visible");

      cy.reload();
      H.DataStudio.Snippets.editor
        .get()
        .should("contain.text", "SELECT * FROM orders WHERE id = 1");
    });
  });

  describe("archiving", () => {
    it("should archive and unarchive a snippet", () => {
      H.createSnippet({
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      H.DataStudio.Library.visit();
      H.DataStudio.Library.libraryPage().findByText("Test snippet").click();

      cy.findByTestId("snippet-header")
        .findByRole("button", { name: /Snippet menu options/ })
        .click();
      H.popover().findByText("Archive").click();

      H.modal().within(() => {
        cy.findByText("Archive snippet?").should("be.visible");
        cy.button("Archive").click();
      });
      cy.wait("@updateSnippet");

      H.DataStudio.Library.libraryPage()
        .findByRole("button", { name: "Snippet collection options" })
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Test snippet")
        .should("not.exist");

      cy.log("Unarchive it from the archived snippets page");
      H.DataStudio.Library.libraryPage()
        .findByRole("button", { name: "Snippet collection options" })
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

      H.DataStudio.nav().findByRole("link", { name: "Semantic layer" }).click();
      H.DataStudio.Library.libraryPage()
        .findByText("Test snippet")
        .should("be.visible");
    });
  });

  describe("snippet folders", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/collection").as("createCollection");
      cy.intercept("PUT", "/api/collection/*").as("updateCollection");
    });

    it("should create a folder with a snippet inside it, then rename and archive the folder", () => {
      H.DataStudio.Library.visit();

      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Collection").click();

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
      });
      cy.wait("@createCollection");

      H.DataStudio.Library.visit();
      H.DataStudio.Library.libraryPage()
        .findByText("Test Folder")
        .should("be.visible");

      cy.log("Create a snippet inside the folder");
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

      cy.log("Rename the folder");
      H.DataStudio.Library.result("Test Folder").icon("ellipsis").click();
      H.popover().findByText("Edit folder details").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("Updated Folder");
        cy.button("Save").click();
      });
      cy.wait("@updateCollection");
      H.DataStudio.Library.libraryPage()
        .findByText("Updated Folder")
        .should("be.visible");

      cy.log("Archive the folder");
      H.DataStudio.Library.result("Updated Folder").icon("ellipsis").click();
      H.popover().findByText("Archive").click();
      H.modal().findByRole("button", { name: "Archive" }).click();
      cy.wait("@updateCollection");

      H.DataStudio.Library.libraryPage()
        .findByRole("button", { name: "Snippet collection options" })
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Updated Folder")
        .should("not.exist");
    });
  });

  describe("breadcrumb folder expansion", () => {
    it("should only expand the relevant folder path when navigating back via breadcrumbs", () => {
      // Create nested folder structure: Parent Folder > Child Folder
      H.createSnippetFolder({
        name: "Parent Folder",
      }).then(({ body: parentFolder }) => {
        H.createSnippetFolder({
          name: "Child Folder",
          parent_id: Number(parentFolder.id),
        }).then(({ body: childFolder }) => {
          // Create a snippet in the child folder
          H.createSnippet({
            name: "Nested Snippet",
            content: "SELECT * FROM orders",
            collection_id: childFolder.id,
          });
        });
      });

      // Create a sibling folder with its own nested content
      // This folder should be visible but NOT expanded (its children hidden)
      H.createSnippetFolder({
        name: "Sibling Folder",
      }).then(({ body: siblingFolder }) => {
        return H.createSnippet({
          name: "Sibling Snippet",
          content: "SELECT 2",
          collection_id: siblingFolder.id,
        }).then(({ body: snippet }) => {
          H.DataStudio.Snippets.visitSnippet(snippet.id);
          H.DataStudio.breadcrumbs()
            .findByRole("link", { name: "Sibling Folder" })
            .click();
        });
      });

      cy.log(
        "Verify the path to Sibling Folder is expanded, but child folder is collapsed",
      );
      H.DataStudio.Library.libraryPage()
        .findByText("Parent Folder")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Child Folder")
        .should("not.exist");
      H.DataStudio.Library.libraryPage()
        .findByText("Nested Snippet")
        .should("not.exist");
      H.DataStudio.Library.libraryPage()
        .findByText("Sibling Folder")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Sibling Snippet")
        .should("be.visible");

      cy.log("Navigate to the nested snippet");
      H.DataStudio.Library.collectionItem("Parent Folder").click();
      H.DataStudio.Library.collectionItem("Child Folder").click();
      H.DataStudio.Library.libraryPage().findByText("Nested Snippet").click();
      H.DataStudio.Snippets.editPage().should("be.visible");

      cy.log("Click the Child Folder breadcrumb to go back to the library");
      H.DataStudio.breadcrumbs()
        .findByRole("link", { name: "Child Folder" })
        .click();

      cy.log(
        "Verify the path to Child Folder is expanded, but sibling folder is collapsed",
      );
      H.DataStudio.Library.libraryPage()
        .findByText("Parent Folder")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Child Folder")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Nested Snippet")
        .should("be.visible");
      // Sibling Folder is visible (it's a child of root which is expanded)
      H.DataStudio.Library.libraryPage()
        .findByText("Sibling Folder")
        .should("be.visible");
      // But Sibling Folder's contents should NOT be visible (folder is collapsed)
      H.DataStudio.Library.libraryPage()
        .findByText("Sibling Snippet")
        .should("not.exist");
    });
  });
});
