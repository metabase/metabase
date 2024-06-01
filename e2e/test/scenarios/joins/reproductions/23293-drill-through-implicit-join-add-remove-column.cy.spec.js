import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  openOrdersTable,
  visitDashboard,
  queryBuilderHeader,
  chartPathWithFillColor,
} from "e2e/support/helpers";

const { ORDERS, PRODUCTS } = SAMPLE_DATABASE;

describe("issue 23293", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  it("should retain the filter when drilling through the dashboard card with implicitly added column (metabase#23293)", () => {
    openOrdersTable();

    cy.findByTestId("viz-settings-button").click();
    modifyColumn("Product ID", "remove");
    modifyColumn("Category", "add");
    cy.wait("@dataset");

    queryBuilderHeader().button("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });

    cy.wait("@saveQuestion").then(({ response }) => {
      cy.button("Not now").click();

      const id = response.body.id;
      const questionDetails = {
        query: {
          "source-table": `card__${id}`,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              PRODUCTS.CATEGORY,
              {
                "source-field": ORDERS.PRODUCT_ID,
              },
            ],
          ],
        },
        display: "bar",
      };

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id } }) => {
          visitDashboard(dashboard_id);
        },
      );

      // Click on the first bar
      chartPathWithFillColor("#509EE3").first().realClick();
      popover()
        .findByText(/^See these/)
        .click();

      cy.findByTestId("qb-filters-panel").should(
        "contain",
        "Product → Category is Doohickey",
      );
      cy.findAllByTestId("header-cell")
        .last()
        .should("have.text", "Product → Category");

      cy.findAllByRole("grid")
        .last()
        .as("tableResults")
        .should("contain", "Doohickey")
        .and("not.contain", "Gizmo");
    });
  });
});

/**
 * @param {string} columnName
 * @param {("add"|"remove")} action
 */
function modifyColumn(columnName, action) {
  cy.findByTestId("sidebar-left").within(() => {
    cy.findByRole("button", { name: "Add or remove columns" }).click();
    if (action === "add") {
      cy.findByLabelText(columnName).should("not.be.checked").click();
    } else {
      cy.findByLabelText(columnName).should("be.checked").click();
    }

    cy.findByRole("button", { name: "Done picking columns" }).click();
  });
}
