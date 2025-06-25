import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
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
    H.createDashboard({ name: "13736 Dashboard" }).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("dashboardId");
      },
    );

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

    cy.findByTestId("data-grid-action-execute-modal")
      .findByText("My Update Action")
      .should("be.visible");
  });
});

describe(
  "scenarios > data editing > action picker",
  { tags: ["@external"] },
  () => {
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();
      H.setTokenFeatures("all");

      cy.intercept("PUT", "/api/dashboard/*").as("saveDashboard");
      cy.intercept("GET", `/api/action/v2/database/${WRITABLE_DB_ID}/table`).as(
        "getPostgresTables",
      );

      H.setTableEditingEnabledForDB(WRITABLE_DB_ID);
      H.setActionsEnabledForDB(WRITABLE_DB_ID);
    });

    it("should allow to pick an action for editable table dashcard", () => {
      H.setTableEditingEnabledForDB(SAMPLE_DB_ID);

      H.createModelFromTableName({
        tableName: "products",
        modelName: "Products Model Test",
      });

      H.createDashboard().then(({ body: { id } }) => {
        H.visitDashboard(id);
      });
      H.createDashboard({ name: "13736 Dashboard" }).then(
        ({ body: { id: dashboardId } }) => {
          cy.wrap(dashboardId).as("dashboardId");
        },
      );

      H.editDashboard();

      cy.findByLabelText("Add editable table").click();
      cy.findByTestId("add-table-sidebar").within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });

      getDashboardCard(0)
        .realHover()
        .within(() => {
          cy.findByLabelText("Configure").click();
        });

      cy.findByTestId("configure-editable-table-sidebar").within(() => {
        cy.findByText("Actions").click();

        cy.findByText("Add new connected action").click();
      });

      H.modal().within(() => {
        cy.findByText("Pick an action to add").should("be.visible");

        cy.log("should display list of databases");
        cy.findByText("QA Postgres12").should("be.visible");
        cy.findByText("Sample Database").should("be.visible");

        cy.log("should have editable table db preselected");
        cy.findByText("Sample Database")
          .closest('[role="link"]')
          .should("have.attr", "data-active");

        cy.log("should allow to pick an action");
        cy.findByText("QA Postgres12").click();
        cy.wait("@getPostgresTables");

        cy.findByText("Newtable").click();
        cy.findByText("Create or Update").click();

        cy.findByText(
          "Where should the values for this row action come from?",
        ).should("be.visible");

        cy.log(
          'should preselect current action parent entity on "choose new action"',
        );
        cy.findByText("Choose a new action").click();

        cy.findByText("Newtable")
          .closest('[role="link"]')
          .should("have.attr", "data-active");

        cy.findByText("Models").click();

        cy.findByText("Products Model Test").should("be.visible");
        cy.findByText("Orders Model").should("be.visible");

        cy.findByText("Products Model Test").click();
        cy.findByText("There are no actions for this model").should(
          "be.visible",
        );

        cy.findByText("Create a new action").click();
      });

      cy.findByTestId("action-creator-modal")
        .should("be.visible")
        .within(() => {
          H.fillActionQuery("SELECT 1");

          cy.findByText("Save").click();
        });

      H.modal()
        .should("have.length", 3)
        .last()
        .within(() => {
          cy.findByPlaceholderText("My new fantastic action")
            .type("New Action 3000")
            .blur();
          cy.findByText("Create").click();
        });

      H.modal()
        .first()
        .within(() => {
          cy.findByText("Pick an action to add").should("be.visible");

          cy.findByText("New Action 3000").should("be.visible").click();
        });

      H.modal().within(() => {
        cy.findByText("This action has no parameters to map").should(
          "be.visible",
        );
        cy.findByText("New Action 3000").should("be.visible");

        cy.findByText("Done").click();
      });

      cy.findByTestId("editable-table-connected-actions-list")
        .findByText("New Action 3000")
        .should("be.visible");
    });
  },
);
