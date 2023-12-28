import {
  restore,
  popover,
  visitQuestion,
  visitDashboard,
  assertQueryBuilderRowCount,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

const questionDetails = {
  name: "29517",
  dataset: true,
  native: {
    query:
      'Select Orders."ID" AS "ID",\nOrders."CREATED_AT" AS "CREATED_AT"\nFrom Orders',
    "template-tags": {},
  },
};

describe("issue 29517 - nested question based on native model with remapped values", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`).as(
        "schema",
      );
      cy.visit(`/model/${id}/metadata`);
      cy.wait("@schema");

      mapModelColumnToDatabase({ table: "Orders", field: "ID" });
      selectModelColumn("CREATED_AT");
      mapModelColumnToDatabase({ table: "Orders", field: "Created At" });

      cy.intercept("PUT", `/api/card/*`).as("updateModel");
      cy.button("Save changes").click();
      cy.wait("@updateModel");

      const nestedQuestionDetails = {
        query: {
          "source-table": `card__${id}`,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              "CREATED_AT",
              { "temporal-unit": "month", "base-type": "type/DateTime" },
            ],
          ],
        },
        display: "line",
      };

      cy.createQuestionAndDashboard({
        questionDetails: nestedQuestionDetails,
      }).then(({ body: card }) => {
        const { card_id, dashboard_id } = card;

        cy.editDashboardCard(card, {
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "dashboard",
              targetId: ORDERS_DASHBOARD_ID,
              parameterMapping: {},
            },
          },
        });

        cy.wrap(card_id).as("nestedQuestionId");
        cy.wrap(dashboard_id).as("dashboardId");
      });
    });
  });

  it("drill-through should work (metabase#29517-1)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.get("@nestedQuestionId").then(id => {
      visitQuestion(id);
    });

    // We can click on any circle; this index was chosen randomly
    cy.get("circle").eq(25).click({ force: true });
    popover()
      .findByText(/^See these/)
      .click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").findByText(
      "Created At is May 1–31, 2024",
    );

    assertQueryBuilderRowCount(520);
  });

  it("click behavior to custom destination should work (metabase#29517-2)", () => {
    cy.get("@dashboardId").then(id => {
      visitDashboard(id);
    });

    cy
      .intercept("GET", `/api/dashboard/${ORDERS_DASHBOARD_ID}`)
      .as("loadTargetDashboard"),
      cy.get("circle").eq(25).click({ force: true });
    cy.wait("@loadTargetDashboard");

    cy.location("pathname").should("eq", `/dashboard/${ORDERS_DASHBOARD_ID}`);
    cy.get(".cellData").contains("37.65");
  });
});

function mapModelColumnToDatabase({ table, field }) {
  cy.findByText("Database column this maps to")
    .closest("#formField-id")
    .findByTestId("select-button")
    .click();
  popover().findByRole("option", { name: table }).click();
  popover().findByRole("option", { name: field }).click();
  cy.contains(`${table} → ${field}`).should("be.visible");
  cy.findByDisplayValue(field);
  cy.findByLabelText("Description").should("not.be.empty");
}

function selectModelColumn(column) {
  cy.findAllByTestId("header-cell").contains(column).click();
}
