import { signInAsAdmin, restore, modal } from "__support__/cypress";

// HACK which lets us type (even very long words) without losing focus
// this is needed for fields where autocomplete suggestions are enabled
function _clearAndIterativelyTypeUsingLabel(label, string) {
  cy.findByLabelText(label)
    .click()
    .clear();

  for (const char of string) {
    cy.findByLabelText(label).type(char);
  }
}

// NOTE: - Had to change user role to "admin" on 2020-11-19.
//       - Normal users don't have permission to create/edit snippets in `ee` version.
//       - CI runs this test twice (both contexts), so it fails on `ee`.
//       - There is a related issue: https://github.com/metabase/metabase-enterprise/issues/543
// TODO: Once the above issue is (re)solved, change back to `signInAsNormalUser`
describe("scenarios > question > snippets", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should let you create and use a snippet", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();

    // Type a query and highlight some of the text
    cy.get(".ace_content").as("editor");
    cy.get("@editor").type(
      "select 'stuff'" + "{shift}{leftarrow}".repeat("'stuff'".length),
    );

    // Add a snippet of that text
    cy.get(".Icon-snippet").click();
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

    cy.visit("/question/new");
    cy.findByText("Native query").click();

    // Populate the native editor first
    // 1. select
    cy.get(".ace_content").as("editor");
    cy.get("@editor").type("select ");
    // 2. snippet
    cy.get(".Icon-snippet").click();
    cy.findByText("stuff-snippet").click();

    // Open the snippet edit modal
    cy.get(".Icon-chevrondown").click({ force: true });
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
});
