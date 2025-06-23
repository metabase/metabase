import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { getDashboardCard } from "e2e/support/helpers";

const { H } = cy;

describe("scenarios > data editing > actions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    cy.intercept("PUT", "/api/dashboard/*").as("saveDashboard");

    H.setTableEditingEnabledForDB(SAMPLE_DB_ID);
  });

  it("should allow to assign a table action to a editable table dashcard", () => {
    H.createDashboard().then(({ body: { id } }) => {
      H.visitDashboard(id);
    });
    H.editDashboard();

    cy.findByLabelText("Add editable table").click();
    cy.findByTestId("add-table-sidebar").findByText("Orders").click();

    getDashboardCard(0)
      .realHover()
      .within(() => {
        cy.findByLabelText("Configure").click();
      });

    cy.findByTestId("configure-editable-table-sidebar").within(() => {
      cy.findByText("Actions").click();

      cy.findByText("Add new connected action").click();
    });

    cy.findByTestId("table-action-settings-modal").should("be.visible");

    H.modal().within(() => {
      cy.findByText("People").click();
      cy.findByText("Update").click();

      cy.findByText("Choose a new action").should("be.visible");
      cy.findByText(
        "Where should the values for this row action come from?",
      ).should("be.visible");

      cy.findByTestId("editable-text")
        .click()
        .type("{SelectAll}My Update Action");

      cy.button("Done").scrollIntoView().click();
    });

    cy.findByTestId("editable-table-connected-actions-list")
      .findByText("My Update Action")
      .should("be.visible");

    cy.findByTestId("edit-bar").findByText("Save").click();

    cy.wait("@saveDashboard");

    getDashboardCard(0).within(() => {
      cy.findByText("Row Actions").should("be.visible");
      cy.findAllByText("My Update Action").first().should("be.visible");

      cy.findAllByText("My Update Action").first().click();
    });

    cy.findByTestId("table-action-execute-modal")
      .findByText("My Update Action")
      .should("be.visible");
  });
});
