import { restore, modal, openNativeEditor } from "__support__/e2e/cypress";

// HACK which lets us type (even very long words) without losing focus
// this is needed for fields where autocomplete suggestions are enabled
function _clearAndIterativelyTypeUsingLabel(label, string) {
  cy.findByLabelText(label).click().clear();

  for (const char of string) {
    cy.findByLabelText(label).type(char);
  }
}

// NOTE: - Had to change user role to "admin" on 2020-11-19.
//       - Normal users don't have permission to create/edit snippets in `ee` version.
//       - CI runs this test twice (both contexts), so it fails on `ee`.
//       - There is a related issue: https://github.com/metabase/metabase-enterprise/issues/543
// TODO: Once the above issue is (re)solved, change back to `cy.signInAsNormalUser`
describe("scenarios > question > snippets", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should let you create and use a snippet", () => {
    openNativeEditor().type(
      // Type a query and highlight some of the text
      "select 'stuff'" + "{shift}{leftarrow}".repeat("'stuff'".length),
    );

    // Add a snippet of that text
    cy.icon("snippet").click();
    cy.contains("Create a snippet").click();

    modal().within(() => {
      cy.findByLabelText("Give your snippet a name").type("stuff-snippet");
      cy.findByText("Save").click();
    });

    // SQL editor should get updated automatically
    cy.get("@editor").contains("select {{snippet: stuff-snippet}}");

    // Run the query and check the value
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.get(".ScalarValue").contains("stuff");
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
    cy.findByText("stuff-snippet").click();

    // Open the snippet edit modal
    cy.icon("chevrondown").click({ force: true });
    cy.findByText("Edit").click();

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
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.get(".ScalarValue").contains("2");
  });

  it.skip("should update the snippet and apply it to the current query (metabase#15387)", () => {
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
      cy.createNativeQuestion({
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
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.visit(`/question/${QUESTION_ID}`);
      });
    });

    cy.get(".Visualization").as("results").findByText("37.65");
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
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.get("@results").contains(/christ/i);
  });
});
