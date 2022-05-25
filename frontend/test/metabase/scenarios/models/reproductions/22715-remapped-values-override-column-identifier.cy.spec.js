import {
  restore,
  visitQuestion,
  popover,
  filter,
} from "__support__/e2e/cypress";

describe.skip("issue 22715 ", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("updateModel");

    restore();
    cy.signInAsAdmin();
  });

  it("fitlering based on the remapped column name should result in a correct query (metabase#22715)", () => {
    cy.createNativeQuestion({
      native: {
        query: `select 1 as "ID", current_timestamp::datetime as "ALIAS_CREATED_AT"`,
      },
    }).then(({ body: { id } }) => {
      // Visit the question to first load metadata
      visitQuestion(id);

      // Turn the question into a model
      cy.request("PUT", `/api/card/${id}`, { dataset: true });

      // Let's go straight to the model metadata editor
      cy.visit(`/model/${id}/metadata`);

      // The first column `ID` is automatically selected
      mapColumnTo({ table: "Orders", column: "ID" });

      cy.findByText("ALIAS_CREATED_AT").click();
      mapColumnTo({ table: "Orders", column: "Created At" });

      // Make sure the column name updated before saving
      cy.findByDisplayValue("Created At");

      cy.button("Save changes").click();
      cy.wait("@updateModel");

      cy.visit(`/model/${id}`);
      cy.wait("@dataset");
    });

    filter();

    cy.findByTestId("sidebar-right").within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Today").click();
    });

    cy.wait("@dataset");

    cy.get(".cellData")
      .should("have.length", 4)
      .and("contain", "Created At");
  });
});

function mapColumnTo({ table, column } = {}) {
  cy.findByText("Database column this maps to")
    .closest(".Form-field")
    .contains("None")
    .click();

  popover()
    .findByText(table)
    .click();
  popover()
    .findByText(column)
    .click();
}
