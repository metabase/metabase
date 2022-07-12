import {
  restore,
  visitQuestion,
  popover,
  filter,
} from "__support__/e2e/helpers";

describe.skip("filtering based on the remapped column name should result in a correct query (metabase#22715)", () => {
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
      // Without this Cypress fails to remap the column because an element becomes detached from the DOM
      cy.findByText(
        "Use the tab key to navigate through settings and columns.",
      );

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
  });

  it("when done through the column header action (metabase#22715-1)", () => {
    cy.findByText("Created At").click();
    cy.findByText("Filter by this column").click();
    cy.findByText("Today").click();

    cy.wait("@dataset");
    cy.findByText("Today").should("not.exist");

    cy.get(".cellData").should("have.length", 4).and("contain", "Created At");
  });

  it("when done through the filter trigger (metabase#22715-2)", () => {
    filter();

    cy.findByTestId("sidebar-right").within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Today").click();
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
