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

    it("should preserve unsaved content changes when description or name is edited", () => {
      cy.log("Navigate to a snippet and edit its content");
      H.createSnippet({
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });
      H.DataStudio.Library.visit();
      H.DataStudio.Library.libraryPage().findByText("Test snippet").click();
      H.DataStudio.Snippets.editor.type("1");

      cy.log("Edit its name");
      cy.findByPlaceholderText("Name").type("1").blur();
      H.undoToast().findByText("Snippet name updated").should("be.visible");
      H.undoToast().icon("close").click();

      cy.log("Edit its description");
      H.DataStudio.Snippets.descriptionInput().type("desc").blur();
      H.undoToast()
        .findByText("Snippet description updated")
        .should("be.visible");
      H.undoToast().icon("close").click();

      cy.log("Verify unsaved changes are preserved");
      H.DataStudio.Snippets.editor
        .value()
        .should("eq", "SELECT * FROM orders1");

      cy.log(
        "Verify Save button saves the content without reverting the name and description changes",
      );
      H.DataStudio.Snippets.saveButton().click();
      H.undoToast().findByText("Snippet content updated").should("be.visible");
      cy.findByPlaceholderText("Name").should("have.value", "Test snippet1");
      H.DataStudio.Snippets.editPage().findByText("desc").should("be.visible");
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

  describe("archive", () => {
    it("should be able to archive a snippet", () => {
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
        cy.wait("@updateSnippet");
      });

      H.DataStudio.Library.libraryPage()
        .findByText("Test snippet")
        .should("not.exist");
    });

    it("should be able to unarchive a snippet", () => {
      H.createSnippet({
        name: "Test snippet",
        content: "SELECT * FROM orders",
        archived: true,
      });

      H.DataStudio.Library.visit();

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

      H.DataStudio.Library.visit();

      H.DataStudio.Library.libraryPage()
        .findByText("Test snippet")
        .should("be.visible");
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
      H.popover().findByText("Snippet folder").click();

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
      H.popover().findByText("Snippet").click();

      H.DataStudio.Snippets.nameInput().clear().type("Folder snippet");
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
        H.createSnippet({
          name: "Sibling Snippet",
          content: "SELECT 2",
          collection_id: siblingFolder.id,
        });
      });

      H.DataStudio.Library.visit();

      cy.log("Verify all folders and their contents are initially expanded");
      H.DataStudio.Library.libraryPage()
        .findByText("Parent Folder")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Child Folder")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Sibling Folder")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Nested Snippet")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Sibling Snippet")
        .should("be.visible");

      cy.log("Navigate to the nested snippet");
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

    it("should expand all folders when navigating directly to library without expandedId params", () => {
      // Create nested folder structure
      H.createSnippetFolder({
        name: "Folder A",
      });
      H.createSnippetFolder({
        name: "Folder B",
      });

      cy.log("Navigate directly to library (no expandedId params)");
      H.DataStudio.Library.visit();

      cy.log("Verify all folders are expanded by default");
      H.DataStudio.Library.libraryPage()
        .findByText("Folder A")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Folder B")
        .should("be.visible");
    });

    it("should expand parent folders when clicking a nested folder in breadcrumbs", () => {
      // Create deeply nested structure: GrandParent > Parent > Child
      H.createSnippetFolder({
        name: "GrandParent Folder",
      }).then(({ body: grandParentFolder }) => {
        H.createSnippetFolder({
          name: "Parent Folder",
          parent_id: Number(grandParentFolder.id),
        }).then(({ body: parentFolder }) => {
          H.createSnippetFolder({
            name: "Child Folder",
            parent_id: Number(parentFolder.id),
          }).then(({ body: childFolder }) => {
            H.createSnippet({
              name: "Deep Snippet",
              content: "SELECT 1",
              collection_id: childFolder.id,
            });
          });
        });
      });

      H.DataStudio.Library.visit();

      cy.log("Navigate to the deeply nested snippet");
      H.DataStudio.Library.libraryPage().findByText("Deep Snippet").click();
      H.DataStudio.Snippets.editPage().should("be.visible");

      cy.log(
        "Click the Parent Folder breadcrumb (middle of the path) to go back",
      );
      H.DataStudio.breadcrumbs()
        .findByRole("link", { name: "Parent Folder" })
        .click();

      cy.log("Verify the path up to Parent Folder is expanded");
      H.DataStudio.Library.libraryPage()
        .findByText("GrandParent Folder")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Parent Folder")
        .should("be.visible");
      // Child Folder should still be visible since it's inside Parent Folder
      H.DataStudio.Library.libraryPage()
        .findByText("Child Folder")
        .should("be.visible");
    });
  });
});
