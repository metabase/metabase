const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";

const { ALL_USERS_GROUP } = USER_GROUPS;

// HACK which lets us type (even very long words) without losing focus
// this is needed for fields where autocomplete suggestions are enabled
function _clearAndIterativelyTypeUsingLabel(label, string) {
  cy.findByLabelText(label).click().clear();

  for (const char of string) {
    cy.findByLabelText(label).type(char);
  }
}

describe("scenarios > question > snippets", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should let you create, use and edit a snippet", () => {
    cy.log("Type a query and highlight some of the text");
    H.startNewNativeQuestion();
    H.NativeEditor.type("select 'stuff'");

    for (let i = 0; i < "'stuff'".length; i++) {
      cy.realPress(["Shift", "ArrowLeft"]);
    }

    cy.log("Add a snippet of that text");
    cy.findByTestId("native-query-editor-action-buttons")
      .icon("snippet")
      .click();
    cy.findByTestId("sidebar-content").findByText("Create snippet").click();

    H.modal().within(() => {
      cy.findByLabelText("Give your snippet a name").type("stuff-snippet");
      cy.button("Save").click();
    });

    cy.log("SQL editor should get updated automatically");
    H.NativeEditor.get().should("contain", "select {{snippet: stuff-snippet}}");

    cy.log("Run the query and check the value");
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.findByTestId("scalar-value").should("have.text", "stuff");

    cy.log(
      "A short snippet preview should not show scrollbars (metabase#21550)",
    );
    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("stuff-snippet").realHover();
      cy.icon("chevrondown").click({ force: true });
      cy.get("pre").should(($pre) => {
        expect($pre).to.contain("'stuff'");
        const preWidth = $pre[0].getBoundingClientRect().width;
        const clientWidth = $pre[0].clientWidth;
        const BORDERS = 2; // 1px left and right
        expect(clientWidth).to.be.gte(preWidth - BORDERS);
      });
    });

    cy.log(
      "The add icon should be visible with existing snippets (metabase#57441)",
    );
    H.rightSidebar().icon("add").should("be.visible").click();
    H.popover().findByText("New snippet").click();
    H.modal().within(() => {
      cy.findByText("Create your new snippet").should("be.visible");
      cy.button("Cancel").click();
    });
    H.modal().should("not.exist");

    cy.log("Edit the snippet");
    H.rightSidebar()
      .findByRole("button", { name: /pencil icon edit/i })
      .click();

    H.modal().within(() => {
      cy.findByText("Editing stuff-snippet");

      _clearAndIterativelyTypeUsingLabel(
        "Enter some SQL here so you can reuse it later",
        "1+1",
      );
      _clearAndIterativelyTypeUsingLabel("Give your snippet a name", "Math");

      cy.findByText("Save").click();
    });

    // SQL editor should get updated automatically
    H.NativeEditor.get().contains("select {{snippet: Math}}");

    // Run the query and check the new value
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.findByTestId("scalar-value").contains("2");
  });

  it("should update the snippet and apply it to the current query (metabase#15387)", () => {
    // Create snippet 1
    cy.request("POST", "/api/native-query-snippet", {
      content: "ORDERS",
      name: "Table: Orders",
      collection_id: null,
    }).then(({ body: { id: SNIPPET_ID } }) => {
      // Create snippet 2
      cy.request("POST", "/api/native-query-snippet", {
        content: "REVIEWS",
        name: "Table: Reviews",
        collection_id: null,
      });

      // Create native question using snippet 1
      H.createNativeQuestion(
        {
          name: "15387",
          native: {
            "template-tags": {
              "snippet: Table: Orders": {
                id: "14a923c5-83a2-b359-64f7-5e287c943caf",
                name: "snippet: Table: Orders",
                "display-name": "Snippet: table: orders",
                type: "snippet",
                "snippet-name": "Table: Orders",
                "snippet-id": SNIPPET_ID,
              },
            },
            query: "select * from {{snippet: Table: Orders}} limit 1",
          },
        },
        { visitQuestion: true },
      );
    });

    cy.findByTestId("query-visualization-root")
      .as("results")
      .findByText("37.65");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open Editor/i).click();
    // We need these mid-point checks to make sure Cypress typed the sequence/query correctly
    // Check 1
    H.NativeEditor.get()
      .should("be.visible")
      .and("have.text", "select * from {{snippet: Table: Orders}} limit 1");
    // Replace "Orders" with "Reviews"
    H.NativeEditor.focus().type(
      "{end}" +
        "{leftarrow}".repeat("}} limit 1".length) + // move left to "reach" the "Orders"
        "{backspace}".repeat("Orders".length) + // Delete orders character by character
        "Reviews",
    );
    // Check 2
    H.NativeEditor.get()
      .should("be.visible")
      .and("have.text", "select * from {{snippet: Table: Reviews}} limit 1");
    // Rerun the query
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.get("@results").contains(/christ/i);
  });

  it("should be possible to search snippets and preview a query that has a snippet in it (metabase#60534)", () => {
    for (let i = 0; i < 16; i++) {
      H.createSnippet({ name: `snippet ${i}`, content: `select ${i}` });
    }
    cy.request("POST", "/api/native-query-snippet", {
      content: "'foo'",
      name: "Foo",
      collection_id: null,
    });

    H.startNewNativeQuestion();
    cy.icon("snippet").click();

    H.rightSidebar().findByText("snippet 2").should("be.visible");
    H.rightSidebar().icon("search").click();
    H.rightSidebar().findByRole("textbox").type("snippet 14");

    H.rightSidebar().findByText("snippet 14").should("be.visible");
    H.rightSidebar().findByText("snippet 2").should("not.exist");

    H.rightSidebar().icon("close").click();
    H.rightSidebar().findByText("snippet 2").should("be.visible");

    cy.log("preview a query that has a snippet in it (metabase#60534)");
    H.NativeEditor.type("select {{snippet: Foo}}");
    cy.findByTestId("native-query-top-bar")
      .findByLabelText("Preview the query")
      .click();
    H.modal().within(() => {
      H.codeMirrorValue().should("eq", "select\n  'foo'");
    });
  });
});

describe("scenarios > question > snippets (OSS)", { tags: "@OSS" }, () => {
  beforeEach(() => {
    H.restore();
  });

  it("should display nested snippets in a flat list", () => {
    createNestedSnippet();

    // Open editor and sidebar
    H.startNewNativeQuestion();
    cy.icon("snippet").click();

    // Confirm snippet is not in folder
    H.rightSidebar().within(() => {
      cy.findByText("snippet 1").should("be.visible");
      cy.findByText("Snippet Folder").should("not.exist");
    });
  });
});

describe("scenarios > question > snippets (EE)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  ["admin", "normal"].forEach((user) => {
    it(`${user} user can create a snippet (metabase#21581)`, () => {
      cy.intercept("POST", "/api/native-query-snippet").as("snippetCreated");

      cy.signIn(user);

      H.startNewNativeQuestion();
      cy.icon("snippet").click();
      cy.findByTestId("sidebar-content").findByText("Create snippet").click();

      H.modal().within(() => {
        cy.findByLabelText(
          "Enter some SQL here so you can reuse it later",
        ).type("SELECT 1", { delay: 0 });
        cy.findByLabelText("Give your snippet a name").type("one", {
          delay: 0,
        });
        cy.button("Save").click();
      });

      cy.wait("@snippetCreated");

      H.NativeEditor.get().should("have.text", "{{snippet: one}}");

      cy.icon("play").first().click();
      cy.findByTestId("scalar-value").contains(1);
    });
  });

  it("should let you create a snippet folder and move a snippet into it", () => {
    // create snippet via API
    cy.request("POST", "/api/native-query-snippet", {
      content: "snippet 1",
      name: "snippet 1",
      collection_id: null,
    });

    H.startNewNativeQuestion();

    // create folder
    cy.icon("snippet").click();
    cy.findByTestId("sidebar-right").as("sidebar").find(".Icon-add").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    H.popover().within(() => cy.findByText("New folder").click());
    H.modal().within(() => {
      cy.findByText("New collection");
      cy.findByLabelText("Name").type("my favorite snippets");
      cy.findByText("Create").click();
    });

    // move snippet into folder
    cy.get("@sidebar")
      .findByText("snippet 1")
      .parent()
      .parent()
      .parent()
      .within(() => {
        cy.icon("chevrondown").click({ force: true });
      });

    H.rightSidebar().within(() => {
      cy.findByText("Edit").click();
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    H.modal().within(() => cy.findByText("SQL snippets").click());
    H.entityPickerModal().within(() => {
      cy.findByText("my favorite snippets").click();
      cy.findByText("Select").click();
    });
    cy.intercept("/api/collection/root/items?namespace=snippets").as(
      "updateList",
    );
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    H.modal().within(() => cy.findByText("Save").click());

    // check that everything is in the right spot
    cy.wait("@updateList");

    cy.findAllByText("snippet 1").should("have.length", 0);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("my favorite snippets").click();
    // The list re-renders while the move's refetch settles; assert on the settled
    // count so a transient duplicate/empty frame doesn't hard-fail `findByText`.

    cy.findAllByText("snippet 1").should("have.length", 1);

    cy.log("via collection picker (metabase#44930");

    // Edit snippet folder
    cy.findByTestId("sidebar-right").within(() => {
      cy.findByText("snippet 1").parent().parent().click();
      cy.button(/Edit/).click();
    });

    H.modal().findByTestId("collection-picker-button").click();
    H.entityPickerModal()
      .findByRole("button", { name: /New folder/ })
      .click();
    H.collectionOnTheGoModal()
      .findByLabelText("Give it a name")
      .type("my special snippets");
    H.collectionOnTheGoModal().findByRole("button", { name: "Create" }).click();
    H.entityPickerModal().findByRole("button", { name: "Select" }).click();
    H.modal().findByRole("button", { name: "Save" }).click();

    cy.findByTestId("sidebar-right").within(() => {
      cy.findAllByText("snippet 1").should("have.length", 0);
      cy.findByText("my special snippets").click();
      cy.findAllByText("snippet 1").should("have.length", 1);
    });
  });

  it("should display nested snippets in their folder", () => {
    function assertSnippetInFolder() {
      cy.icon("snippet").click();
      H.rightSidebar().within(() => {
        cy.findByText("Snippet Folder").click();
        cy.findByText("snippet 1").click();
      });
    }

    createNestedSnippet();

    cy.log("as admin user");
    cy.signIn("admin");
    H.startNewNativeQuestion();
    assertSnippetInFolder();

    cy.log("as nocollection user");
    cy.signIn("nocollection");
    cy.reload();
    assertSnippetInFolder();
  });

  describe("navigation", () => {
    beforeEach(() => {
      cy.signInAsNormalUser();
      createDoublyNestedSnippet();
    });

    it("should be possible to go back to parent folders (metabase#63405)", () => {
      H.startNewNativeQuestion();
      cy.findByTestId("native-query-top-bar").icon("snippet").click();
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Folder A").click();
        cy.findByText("Folder B").click();

        cy.log("We should reach the nested folder");
        cy.findByText("snippet 1").should("be.visible");

        cy.findByText("Folder B").click();
        cy.findByText("Folder A").click();

        cy.log("We should be back at the root folder");
        cy.findByText("Snippets").should("be.visible");
      });
    });
  });

  describe("existing snippet folder", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/collection/root").as("collections");

      cy.signInAsAdmin();

      cy.request("POST", "/api/collection", {
        name: "Snippet Folder",
        description: null,
        parent_id: null,
        namespace: "snippets",
      }).then(({ body }) => {
        cy.request("POST", "/api/collection", {
          name: "Nested snippet Folder",
          description: null,
          parent_id: body.id,
          namespace: "snippets",
        });
      });
    });

    it("should not allow you to move a snippet collection into itself (metabase#44930)", () => {
      H.startNewNativeQuestion();
      cy.icon("snippet").click();

      // Edit snippet folder
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Snippet Folder")
          .next()
          .find(".Icon-ellipsis")
          .click({ force: true });
      });

      H.popover().findByText("Edit folder details").click();
      H.modal().findByTestId("collection-picker-button").click();

      H.entityPickerModalItem(1, /Snippet Folder/).should(
        "have.attr",
        "data-disabled",
        "true",
      );
    });

    it("should not display snippet folder as part of collections and shouldn't update root permissions when changing permissions on a created folder (metabase#14907, metabase#17268)", () => {
      cy.intercept("PUT", "/api/collection/graph?skip-graph=true").as(
        "updatePermissions",
      );

      cy.log(
        "should not display snippet folder as part of collections (metabase#14907)",
      );
      cy.visit("/collection/root");

      cy.wait("@collections");
      H.navigationSidebar().findByText("First collection").should("be.visible");
      H.navigationSidebar().findByText("Snippet Folder").should("not.exist");
      H.collectionTable().findByText("First collection").should("be.visible");
      H.collectionTable().findByText("Snippet Folder").should("not.exist");

      cy.log(
        "shouldn't update root permissions when changing permissions on a created folder (metabase#17268)",
      );
      H.startNewNativeQuestion();
      cy.icon("snippet").click();

      // Edit permissions for a snippet folder
      H.rightSidebar()
        .findByText("Snippet Folder")
        .parent()
        .findByRole("button", { name: "Snippet folder options" })
        .click({ force: true });

      H.popover().findByText("Change permissions").click();

      // Update permissions for "All users" and let them only "View" this folder
      H.modal().within(() => {
        getPermissionsForUserGroup("All Users")
          .should("contain", "Curate")
          .click();
      });

      H.popover().contains("View").click();
      H.modal().button("Save").click();

      cy.wait("@updatePermissions");

      // Now let's do the sanity check for the top level (root) snippet permissions and make sure nothing changed there
      H.rightSidebar()
        .findByTestId("snippet-header-buttons")
        .icon("ellipsis")
        .click();

      H.popover().findByText("Change permissions").click();

      // UI check
      H.modal().within(() => {
        getPermissionsForUserGroup("All Users").should("contain", "Curate");
      });

      // API check
      cy.request("GET", "/api/collection/graph?namespace=snippets").then(
        ({ body }) => {
          const allUsers = body.groups[ALL_USERS_GROUP];
          expect(allUsers.root).to.equal("write");
        },
      );
    });
  });
});

describe("scenarios > question > read-only snippets", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.createSnippet({
      name: "stuff-snippet",
      content: "select 'snippet 1'",
    });
    H.createSnippetFolder({
      name: "My favorite snippets",
      description: "the more you know",
    });
    H.setupGitSync();
  });

  it("should not let you create or edit a snippet or a snippet folder", () => {
    H.configureGitAndPullChanges("read-only");
    H.startNewNativeQuestion();
    cy.findByTestId("native-query-editor-action-buttons")
      .icon("snippet")
      .click();

    cy.findByTestId("sidebar-right").within(() => {
      cy.findByText("My favorite snippets").should("be.visible");
      cy.findByText("stuff-snippet").should("be.visible");

      cy.log("Menu that allows creating a snippet or a folder is not rendered");
      cy.findByTestId("snippet-header-buttons")
        .icon("search")
        .should("be.visible");
      cy.findByTestId("snippet-header-buttons").icon("add").should("not.exist");
      cy.findByRole("button", { name: "Snippet folder options" }).should(
        "not.exist",
      );

      cy.log("An expanded snippet has no edit button");
      cy.icon("chevrondown").click({ force: true });
      cy.get("pre").should("have.text", "select 'snippet 1'");
      cy.findByRole("button", { name: /pencil icon edit/i }).should(
        "not.exist",
      );
    });
  });
});

function createNestedSnippet() {
  cy.signInAsAdmin();
  // Create snippet folder via API
  cy.request("POST", "/api/collection", {
    name: "Snippet Folder",
    description: null,
    parent_id: null,
    namespace: "snippets",
  }).then(({ body: { id } }) => {
    // Create snippet in folder via API
    cy.request("POST", "/api/native-query-snippet", {
      content: "snippet 1",
      name: "snippet 1",
      collection_id: id,
    });
  });
}

function getPermissionsForUserGroup(userGroup) {
  return cy
    .findByText(userGroup)
    .closest("tr")
    .find("[data-testid=permissions-select]");
}

function createDoublyNestedSnippet() {
  // Create snippet folder via API
  cy.request("POST", "/api/collection", {
    name: "Folder A",
    description: null,
    parent_id: null,
    namespace: "snippets",
  }).then(({ body: { id } }) => {
    cy.request("POST", "/api/collection", {
      name: "Folder B",
      description: null,
      parent_id: id,
      namespace: "snippets",
    }).then(({ body: { id } }) => {
      // Create snippet in folder via API
      cy.request("POST", "/api/native-query-snippet", {
        content: "snippet 1",
        name: "snippet 1",
        collection_id: id,
      });
    });
  });
}
