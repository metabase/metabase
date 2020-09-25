import { signInAsNormalUser, restore, modal } from "__support__/cypress";

function _clearAndRecursivelyTypeUsingLabel(label, string) {
  // Cypress throws an error when trying to type an empty string
  if (!string) {
    return;
  }

  cy.findByLabelText(label).clear();

  for (const char of string) {
    cy.findByLabelText(label).type(char);
  }
}

describe("scenarios > question > snippets", () => {
  before(restore);
  beforeEach(signInAsNormalUser);

  it("should let you create and use a snippet", () => {
    const snippet = {
      name: "stuff-snippet",
      sql: "stuff",
    };
    // Single quotes are easy to miss here, but are very important!
    // We're not using SQL keywords or actual tables, so our string must be escaped.
    const escapedSQL = `'${snippet.sql}'`;

    cy.visit("/question/new");
    cy.contains("Native query").click();

    // type a query and highlight some of the text
    cy.get(".ace_content").as("ace");
    cy.get("@ace").type(
      `select ${escapedSQL}` + `{shift}{leftarrow}`.repeat(escapedSQL.length),
    );

    // add a snippet of that text
    cy.get(".Icon-snippet").click();
    cy.contains("Create a snippet").click();

    modal()
      .find("input[name=name]")
      .type(snippet.name);
    modal()
      .contains("Save")
      .click();

    // SQL editor should get updated automatically
    cy.get("@ace").contains(`select {{snippet: ${snippet.name}}}`);

    // run the query and check the displayed scalar
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.get(".ScalarValue").contains(snippet.sql);
  });

  it("should let you edit snippet", () => {
    const snippet = {
      name: "foo-snippet",
      sql: "some extremely very very loooong snippet",
    };
    const escapedSQL = `'${snippet.sql}'`;

    // open the snippet edit modal
    cy.get(".Icon-chevrondown").click({ force: true });
    cy.findByText("Edit").click();

    cy.server();
    cy.route("put", "/api/native-query-snippet/*").as("update-snippet");

    // update the name and content
    modal().within(() => {
      cy.findByText("Editing stuff-snippet");

      _clearAndRecursivelyTypeUsingLabel(
        "Enter some SQL here so you can reuse it later",
        escapedSQL,
      );
      _clearAndRecursivelyTypeUsingLabel(
        "Give your snippet a name",
        snippet.name,
      );

      cy.findByText("Save").click();
    });

    cy.wait("@update-snippet");

    // SQL editor should get updated automatically
    cy.get(".ace_content").contains(`select {{snippet: ${snippet.name}}}`);

    // run the query and check the displayed scalar
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.get(".ScalarValue").contains(snippet.sql);
  });
});
