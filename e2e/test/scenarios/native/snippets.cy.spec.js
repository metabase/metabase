import { USER_GROUPS } from "e2e/support/cypress_data";
import {
  restore,
  modal,
  popover,
  describeEE,
  openNativeEditor,
  rightSidebar,
  setTokenFeatures,
  onlyOnOSS,
  entityPickerModal,
  collectionOnTheGoModal,
} from "e2e/support/helpers";

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
    restore();
    cy.signInAsNormalUser();
  });

  it("should let you create and use a snippet", () => {
    cy.log("Type a query and highlight some of the text");
    openNativeEditor().type(
      "select 'stuff'" + "{shift}{leftarrow}".repeat("'stuff'".length),
    );

    cy.log("Add a snippet of that text");
    cy.findByTestId("native-query-editor-sidebar").icon("snippet").click();
    cy.findByTestId("sidebar-content").findByText("Create a snippet").click();

    modal().within(() => {
      cy.findByLabelText("Give your snippet a name").type("stuff-snippet");
      cy.button("Save").click();
    });

    cy.log("SQL editor should get updated automatically");
    cy.get("@editor").should("contain", "select {{snippet: stuff-snippet}}");

    cy.log("Run the query and check the value");
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.findByTestId("scalar-value").should("have.text", "stuff");
  });

  it("should let you edit snippet", () => {
    // Re-create the above snippet via API without the need to rely on the previous test
    cy.request("POST", "/api/native-query-snippet", {
      name: "stuff-snippet",
      content: "stuff",
    });

    // Populate the native editor first
    // 1. select
    openNativeEditor().type("select ");
    // 2. snippet
    cy.icon("snippet").click();
    cy.findByTestId("sidebar-right").within(() => {
      cy.findByText("stuff-snippet").click();

      // Open the snippet edit modal
      cy.icon("chevrondown").click({ force: true });
      cy.findByRole("button", { name: /pencil icon edit/i }).click();
    });

    // Update the name and content
    modal().within(() => {
      cy.findByText("Editing stuff-snippet");

      _clearAndIterativelyTypeUsingLabel(
        "Enter some SQL here so you can reuse it later",
        "1+1",
      );
      _clearAndIterativelyTypeUsingLabel("Give your snippet a name", "Math");

      cy.findByText("Save").click();
    });

    // SQL editor should get updated automatically
    cy.get("@editor").contains("select {{snippet: Math}}");

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
      cy.createNativeQuestion(
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open Editor/i).click();
    // We need these mid-point checks to make sure Cypress typed the sequence/query correctly
    // Check 1
    cy.get(".ace_content")
      .as("editor")
      .contains(/^select \* from {{snippet: Table: Orders}} limit 1$/);
    // Replace "Orders" with "Reviews"
    cy.get("@editor")
      .click()
      .type(
        "{end}" +
          "{leftarrow}".repeat("}} limit 1".length) + // move left to "reach" the "Orders"
          "{backspace}".repeat("Orders".length) + // Delete orders character by character
          "Reviews",
      );
    // Check 2
    cy.get("@editor").contains(
      /^select \* from {{snippet: Table: Reviews}} limit 1$/,
    );
    // Rerun the query
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.get("@results").contains(/christ/i);
  });
});

describe("scenarios > question > snippets (OSS)", { tags: "@OSS" }, () => {
  beforeEach(() => {
    onlyOnOSS();
    restore();
  });

  it("should display nested snippets in a flat list", () => {
    createNestedSnippet();

    // Open editor and sidebar
    openNativeEditor();
    cy.icon("snippet").click();

    // Confirm snippet is not in folder
    rightSidebar().within(() => {
      cy.findByText("snippet 1").should("be.visible");
    });
  });
});

describeEE("scenarios > question > snippets (EE)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  ["admin", "normal"].forEach(user => {
    it(`${user} user can create a snippet (metabase#21581)`, () => {
      cy.intercept("POST", "/api/native-query-snippet").as("snippetCreated");

      cy.signIn(user);

      openNativeEditor();
      cy.icon("snippet").click();
      cy.findByTestId("sidebar-content").findByText("Create a snippet").click();

      modal().within(() => {
        cy.findByLabelText(
          "Enter some SQL here so you can reuse it later",
        ).type("SELECT 1", { delay: 0 });
        cy.findByLabelText("Give your snippet a name").type("one", {
          delay: 0,
        });
        cy.button("Save").click();
      });

      cy.wait("@snippetCreated");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("{{snippet: one}}");

      cy.icon("play").first().click();
      cy.findByTestId("scalar-value").contains(1);
    });
  });

  it("should let you create a snippet folder and move a snippet into it", () => {
    cy.signInAsAdmin();
    // create snippet via API
    cy.request("POST", "/api/native-query-snippet", {
      content: "snippet 1",
      name: "snippet 1",
      collection_id: null,
    });

    openNativeEditor();

    // create folder
    cy.icon("snippet").click();
    cy.findByTestId("sidebar-right").as("sidebar").find(".Icon-add").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("New folder").click());
    modal().within(() => {
      cy.findByText("Create your new folder");
      cy.findByLabelText("Give your folder a name").type(
        "my favorite snippets",
      );
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

    rightSidebar().within(() => {
      cy.findByText("Edit").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    modal().within(() => cy.findByText("Top folder").click());
    entityPickerModal().within(() => {
      cy.findByText("my favorite snippets").click();
      cy.findByText("Select").click();
    });
    cy.intercept("/api/collection/root/items?namespace=snippets").as(
      "updateList",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    modal().within(() => cy.findByText("Save").click());

    // check that everything is in the right spot
    cy.wait("@updateList");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("snippet 1").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("my favorite snippets").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("snippet 1");

    cy.log("via collection picker (metabase#44930");

    // Edit snippet folder
    cy.findByTestId("sidebar-right").within(() => {
      cy.findByText("snippet 1").parent().parent().click();
      cy.button(/Edit/).click();
    });

    modal().findByTestId("collection-picker-button").click();
    entityPickerModal()
      .findByRole("button", { name: /Create a new collection/ })
      .click();
    collectionOnTheGoModal()
      .findByLabelText("Give it a name")
      .type("my special snippets");
    collectionOnTheGoModal().findByRole("button", { name: "Create" }).click();
    entityPickerModal().findByRole("button", { name: "Select" }).click();
    modal().findByRole("button", { name: "Save" }).click();

    cy.findByTestId("sidebar-right").within(() => {
      cy.findByText("snippet 1").should("not.exist");
      cy.findByText("my special snippets").click();
      cy.findByText("snippet 1").should("exist");
    });
  });

  ["admin", "nocollection"].map(user => {
    it("should display nested snippets in their folder", () => {
      createNestedSnippet();

      cy.signIn(user);

      // Open editor and sidebar
      openNativeEditor();
      cy.icon("snippet").click();

      // Confirm snippet is in folder
      rightSidebar().within(() => {
        cy.findByText("Snippet Folder").click();
        cy.findByText("snippet 1").click();
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

    it("should not allow you to move a snippet collection into a itself or a child (metabase#44930)", () => {
      openNativeEditor();
      cy.icon("snippet").click();

      // Edit snippet folder
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Snippet Folder")
          .next()
          .find(".Icon-ellipsis")
          .click({ force: true });
      });

      popover().findByText("Edit folder details").click();
      modal().findByTestId("collection-picker-button").click();

      entityPickerModal()
        .findByRole("button", { name: /Snippet Folder/ })
        .should("be.disabled");
    });

    it("should not display snippet folder as part of collections (metabase#14907)", () => {
      cy.visit("/collection/root");

      cy.wait("@collections");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Snippet Folder").should("not.exist");
    });

    it("shouldn't update root permissions when changing permissions on a created folder (metabase#17268)", () => {
      cy.intercept("PUT", "/api/collection/graph").as("updatePermissions");

      openNativeEditor();
      cy.icon("snippet").click();

      // Edit permissions for a snippet folder
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Snippet Folder")
          .next()
          .find(".Icon-ellipsis")
          .click({ force: true });
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Change permissions").click();

      // Update permissions for "All users" and let them only "View" this folder
      modal().within(() => {
        getPermissionsForUserGroup("All Users")
          .should("contain", "Curate")
          .click();
      });

      popover().contains("View").click();
      cy.button("Save").click();

      cy.wait("@updatePermissions");

      // Now let's do the sanity check for the top level (root) snippet permissions and make sure nothing changed there
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Snippets").parent().next().find(".Icon-ellipsis").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Change permissions").click();

      // UI check
      modal().within(() => {
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
