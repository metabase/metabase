import {
  editDashboard,
  restore,
  saveDashboard,
  setActionsEnabledForDB,
  visitDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

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
        visitDashboard(1);
        editDashboard();
        cy.button("Add action").click();

        cy.findByTestId("dashboard-parameters-and-cards").within(() => {
          const actionButtonContainer = cy.findByTestId(
            "action-button-full-container",
          );
          const dashCard = cy.contains(".DashCard", "Click Me");

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
        visitDashboard(1);
        editDashboard();
        cy.findByLabelText("Add action").click();

        saveDashboard();
        cy.findByLabelText("info icon").click();

        cy.findByTestId("dashboard-parameters-and-cards").within(() => {
          const actionButtonContainer = cy.findByTestId(
            "action-button-full-container",
          );
          const dashCard = cy.contains(".DashCard", "Click Me");
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
