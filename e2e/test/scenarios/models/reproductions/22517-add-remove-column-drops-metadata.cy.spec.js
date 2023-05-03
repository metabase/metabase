import { restore, openQuestionActions } from "e2e/support/helpers";

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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit metadata").click();

    renameColumn("ID", "Foo");

    cy.button("Save changes").click();
    cy.wait("@updateMetadata");
  });

  it("adding or removging a column should not drop previously edited metadata (metabase#22517)", () => {
    openQuestionActions();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit query definition").click();

    // Make sure previous metadata changes are reflected in the UI
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo");

    // This will edit the original query and add the `SIZE` column
    // Updated query: `select *, case when quantity > 4 then 'large' else 'small' end size from orders`
    cy.get(".ace_content").type(
      "{leftarrow}".repeat(" from orders".length) +
        ", case when quantity > 4 then 'large' else 'small' end size ",
    );

    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo");
  });
});

function renameColumn(column, newName) {
  cy.findByDisplayValue(column).clear().type(newName).blur();
}
