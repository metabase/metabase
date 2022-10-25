import { restore, openQuestionActions } from "__support__/e2e/helpers";

describe("issue 22517", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("PUT", "/api/card/*").as("updateMetadata");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(
      {
        name: "22517",
        native: { query: `select * from orders` },
        dataset: true,
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    cy.findByText("Edit metadata").click();

    renameColumn("ID", "Foo");

    cy.button("Save changes").click();
    cy.wait("@updateMetadata");
  });

  it("adding or removging a column should not drop previously edited metadata (metabase#22517)", () => {
    openQuestionActions();
    cy.findByText("Edit query definition").click();

    // Make sure previous metadata changes are reflected in the UI
    cy.findByText("Foo");

    // This will edit the original query and add the `SIZE` column
    // Updated query: `select *, case when quantity > 4 then 'large' else 'small' end size from orders`
    cy.get(".ace_content").type(
      "{leftarrow}".repeat(" from orders".length) +
        ", case when quantity > 4 then 'large' else 'small' end size ",
    );

    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.wait("@dataset");

    cy.findByText("Foo");

    cy.findByText("Save changes").click();

    cy.findByText("Foo");
  });
});

function renameColumn(column, newName) {
  cy.findByDisplayValue(column).clear().type(newName).blur();
}
