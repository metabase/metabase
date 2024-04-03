import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  editDashboard,
  restore,
  saveDashboard,
  setActionsEnabledForDB,
  visitDashboard,
} from "e2e/support/helpers";

const viewports = [
  [768, 800],
  [1024, 800],
  [1440, 800],
];
describe("metabase#31587", () => {
  viewports.forEach(([width, height]) => {
    describe(`Testing on resolution ${width} x ${height}`, () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();
        setActionsEnabledForDB(SAMPLE_DB_ID);
        cy.viewport(width, height);
      });
      it("should not allow action buttons to overflow when editing dashboard", () => {
        visitDashboard(ORDERS_DASHBOARD_ID);
        editDashboard();
        cy.button("Add action").click();

        cy.findByTestId("dashboard-parameters-and-cards").within(() => {
          const actionButtonContainer = cy.findByTestId(
            "action-button-full-container",
          );
          const dashCard = cy
            .findAllByTestId("dashcard-container")
            .last()
            .should("have.text", "Click Me");

          actionButtonContainer.then(actionButtonElem => {
            dashCard.then(dashCardElem => {
              expect(actionButtonElem[0].scrollHeight).to.eq(
                dashCardElem[0].scrollHeight,
              );
            });
          });
        });
      });

      it("should not allow action buttons to overflow when viewing info sidebar", () => {
        visitDashboard(ORDERS_DASHBOARD_ID);
        editDashboard();
        cy.findByLabelText("Add action").click();

        saveDashboard();
        cy.icon("info").click();

        cy.findByTestId("dashboard-parameters-and-cards").within(() => {
          const actionButtonContainer = cy.findByTestId(
            "action-button-full-container",
          );
          const dashCard = cy
            .findAllByTestId("dashcard-container")
            .last()
            .should("have.text", "Click Me");

          actionButtonContainer.then(actionButtonElem => {
            dashCard.then(dashCardElem => {
              expect(actionButtonElem[0].scrollHeight).to.eq(
                dashCardElem[0].scrollHeight,
              );
            });
          });
        });
      });
    });
  });
});
