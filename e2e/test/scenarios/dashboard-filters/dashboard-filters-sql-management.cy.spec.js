describe("scenarios > dashboard > filters > SQL > management", () => {
  beforeEach(() => {
    cy.restore();
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
          cy.visitDashboard(dashboard_id);
        },
      );
      cy.editDashboard();
    });

    it("should reset mappings when current operator is '=' and new operator is not '='", () => {
      cy.setFilter("Number", "Equal to");

      cy.getDashboardCard().findByRole("button").click();
      cy.popover().findByText("Tax GTE").click();

      cy.saveDashboard();

      cy.filterWidget().type("10{enter}");

      cy.getDashboardCard().should("contain", "1,062");

      cy.editDashboard();

      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .contains("Equal to")
        .click();

      cy.sidebar().findByText("Filter operator").next().click();
      cy.popover().findByText("Between").click();

      cy.getDashboardCard().should("not.contain", "Column to filter on");

      cy.sidebar().findByText("Filter operator").next().click();
      cy.popover().findByText("Equal to").click();

      cy.getDashboardCard().should("not.contain", "Tax GTE");

      cy.saveDashboard();

      cy.filterWidget().should("not.exist");
    });
  });
});
