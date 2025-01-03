import { H } from "e2e/support";

describe("scenarios > dashboard > filters > SQL > management", () => {
  beforeEach(() => {
    H.restore();
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
          H.visitDashboard(dashboard_id);
        },
      );
      H.editDashboard();
    });

    it("should reset mappings when current operator is '=' and new operator is not '='", () => {
      H.setFilter("Number", "Equal to");

      H.getDashboardCard().findByRole("button").click();
      H.popover().findByText("Tax GTE").click();

      H.saveDashboard();

      H.filterWidget().type("10{enter}");

      H.getDashboardCard().should("contain", "1,062");

      H.editDashboard();

      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .contains("Equal to")
        .click();

      H.sidebar().findByText("Filter operator").next().click();
      H.popover().findByText("Between").click();

      H.getDashboardCard().should("not.contain", "Column to filter on");

      H.sidebar().findByText("Filter operator").next().click();
      H.popover().findByText("Equal to").click();

      H.getDashboardCard().should("not.contain", "Tax GTE");

      H.saveDashboard();

      H.filterWidget().should("not.exist");
    });
  });
});
