import { signInAsNormalUser, restore, modal } from "__support__/cypress";

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

describe("scenarios > question > snippets", () => {
  before(restore);
  beforeEach(signInAsNormalUser);

  it("should let you create and use a snippet", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();

    // type a query and highlight some of the text
    cy.get(".ace_content").as("ace");
    cy.get("@ace").type(
      "select 'stuff'" + "{shift}{leftarrow}".repeat("'stuff'".length),
    );

    // add a snippet of that text
    cy.get(".Icon-snippet").click();
    cy.contains("Create a snippet").click();

    modal()
      .find("input[name=name]")
      .type("stuff-snippet");
    modal()
      .contains("Save")
      .click();

    // SQL editor should get updated automatically
    cy.get("@ace").contains("select {{snippet: stuff-snippet}}");

    // run the query and check the displayed scalar
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.get(".ScalarValue").contains("stuff");
  });

  it("should let you edit snippet", () => {
    // open the snippet edit modal
    cy.get(".Icon-chevrondown").click({ force: true });
    cy.findByText("Edit").click();

    // update the name and content
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
    cy.get(".ace_content").contains("select {{snippet: Math}}");

    // run the query and check the displayed scalar
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.get(".ScalarValue").contains("2");
  });
});
