import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createDashboardWithTabs,
  dashboardGrid,
  editDashboard,
  getDashboardCards,
  restore,
  visitDashboard,
} from "e2e/support/helpers";
import { createMockDashboardCard } from "metabase-types/api/mocks";

const TAB_1 = {
  id: 1,
  name: "Tab 1",
};
const TAB_2 = {
  id: 2,
  name: "Tab 2",
};

describe("issue 40695", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not show dashcards from other tabs after entering and leaving editing mode", () => {
    createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          dashboard_tab_id: TAB_1.id,
          size_x: 10,
          size_y: 4,
          card_id: ORDERS_QUESTION_ID,
        }),
        createMockDashboardCard({
          id: -2,
          dashboard_tab_id: TAB_2.id,
          size_x: 10,
          size_y: 4,
          card_id: ORDERS_COUNT_QUESTION_ID,
        }),
      ],
    }).then(dashboard => visitDashboard(dashboard.id));

    editDashboard();
    cy.findByTestId("edit-bar").button("Cancel").click();

    dashboardGrid().within(() => {
      cy.findByText("Orders").should("exist");
      cy.findByText("Orders, Count").should("not.exist");
      getDashboardCards().should("have.length", 1);
    });
  });
});
