import { restore, visitQuestion, popover, filter } from "e2e/support/helpers";

describe("filtering based on the remapped column name should result in a correct query (metabase#22715)", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("updateModel");

    restore();
    cy.signInAsAdmin();

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
      // Without this Cypress fails to remap the column because an element becomes detached from the DOM.
      // This is caused by the DatasetFieldMetadataSidebar component rerendering mulitple times.
      cy.findByText("Database column this maps to");
      cy.wait(5000);

      // The first column `ID` is automatically selected
      mapColumnTo({ table: "Orders", column: "ID" });

      cy.findByText("ALIAS_CREATED_AT").click();

      // Without this Cypress fails to remap the column because an element becomes detached from the DOM.
      // This is caused by the DatasetFieldMetadataSidebar component rerendering mulitple times.
      cy.wait(5000);
      mapColumnTo({ table: "Orders", column: "Created At" });

      // Make sure the column name updated before saving
      cy.findByDisplayValue("Created At");

      cy.button("Save changes").click();
      cy.wait("@updateModel");

      cy.visit(`/model/${id}`);
      cy.wait("@dataset");
    });
  });

  it("when done through the column header action (metabase#22715-1)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Today").click();

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Today").should("not.exist");

    cy.get(".cellData").should("have.length", 4).and("contain", "Created At");
  });

  it("when done through the filter trigger (metabase#22715-2)", () => {
    filter();

    cy.get(".Modal").within(() => {
      cy.findByText("Today").click();
      cy.findByText("Apply Filters").click();
    });

    cy.wait("@dataset");

    cy.get(".cellData").should("have.length", 4).and("contain", "Created At");
  });
});

function mapColumnTo({ table, column } = {}) {
  cy.findByText("Database column this maps to")
    .closest(".Form-field")
    .contains("None")
    .click();

  popover().findByText(table).click();
  popover().findByText(column).click();
}
