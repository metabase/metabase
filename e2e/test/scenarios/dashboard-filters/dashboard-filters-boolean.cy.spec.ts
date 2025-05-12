const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > number", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow to map a boolean parameter to a boolean column of an MBQL query", () => {
    const questionDetails: StructuredQuestionDetails = {
      name: "Q1",
      query: {
        "source-table": PRODUCTS_ID,
        expressions: {
          IdOne: ["=", ["field", PRODUCTS.ID, null], 1],
        },
      },
    };
    H.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      },
    );

    cy.log("mapping");
    H.editDashboard();
    H.setFilter("Boolean");
    H.selectDashboardFilter(H.getDashboardCard(), "IdOne");
    H.saveDashboard();

    cy.log("parameter widget");
    H.getDashboardCard().findByText("200 rows").should("be.visible");
    H.filterWidget().click();
    H.popover().button("Add filter").click();
    H.getDashboardCard().findByText("1 row").should("be.visible");
    H.filterWidget().icon("close").click();
    H.getDashboardCard().findByText("200 rows").should("be.visible");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("False").click();
      cy.findByText("Add filter").click();
    });
    H.getDashboardCard().findByText("199 rows").should("be.visible");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("True").click();
      cy.findByText("Update filter").click();
    });
    H.getDashboardCard().findByText("1 row").should("be.visible");

    cy.log("drill-thru");
    H.getDashboardCard().findByText("Q1").click();
    H.queryBuilderFiltersPanel()
      .findByText("IdOne is true")
      .should("be.visible");
    H.assertQueryBuilderRowCount(1);
  });
});
