import {
  addOrUpdateDashboardCard,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

import { createFunnelBarQuestion } from "e2e/support/helpers/e2e-visualization-helpers";

describe("scenarios > dashboard card resizing", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow cards to be resized", () => {
    cy.createDashboard().then(({ body: { id: dashId } }) => {
      cy.createNativeQuestion(createFunnelBarQuestion()).then(
        ({ body: { id: card_id } }) => {
          addOrUpdateDashboardCard({
            card_id,
            dashboard_id: dashId,
            card: { row: 0, col: 0, size_x: 2, size_y: 2 },
          });

          visitDashboard(dashId);
        },
      );
    });
    cy.icon("pencil").click();
    cy.get(".Dashcard .react-resizable-handle");
  });
});
