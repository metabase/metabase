import {
  restore,
  filterWidget,
  editDashboard,
  saveDashboard,
  visitDashboard,
  sidebar,
  getDashboardCard,
  popover,
  setFilter,
} from "e2e/support/helpers";

describe("scenarios > dashboard > filters > SQL > management", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("number filter", () => {
    const questionDetails = {
      name: "SQL question with Number variable",
      native: {
        "template-tags": {
          tax: {
            type: "number",
            name: "tax",
            id: "0a60ecb5-69b8-49e8-b494-ad67ad7d1050",
            "display-name": "Tax GTE",
            "widget-type": null,
            default: null,
          },
        },
        query: "select * from orders where tax >= {{tax}};",
      },
    };

    beforeEach(() => {
      cy.createNativeQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id } }) => {
          visitDashboard(dashboard_id);
        },
      );
      editDashboard();
    });

    it("should reset mappings when current operator is '=' and new operator is not '='", () => {
      setFilter("Number", "Equal to");

      getDashboardCard().findByRole("button").click();
      popover().findByText("Tax GTE").click();

      saveDashboard();

      filterWidget().type("10{enter}");

      getDashboardCard().should("contain", "1,062");

      editDashboard();

      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .contains("Equal to")
        .click();

      sidebar().findByText("Filter operator").next().click();
      popover().findByText("Between").click();

      getDashboardCard().should("not.contain", "Column to filter on");

      sidebar().findByText("Filter operator").next().click();
      popover().findByText("Equal to").click();

      getDashboardCard().should("not.contain", "Tax GTE");

      saveDashboard();

      filterWidget().should("not.exist");
    });
  });
});
