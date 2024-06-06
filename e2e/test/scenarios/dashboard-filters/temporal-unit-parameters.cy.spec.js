import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addOrUpdateDashboardCard,
  createQuestion,
  editDashboard,
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const singleBreakoutQuestionDetails = {
  name: "Question 1",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};

const multiBreakoutQuestionDetails = {
  name: "Question 2",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
      [
        "field",
        PRODUCTS.CREATED_AT,
        { "temporal-unit": "year", "source-field": ORDERS.PRODUCT_ID },
      ],
    ],
  },
};

const noBreakoutQuestionDetails = {
  name: "Question 3",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    limit: 1,
  },
};

const multiStageQuestionDetails = {
  name: "Question 4",
  display: "table",
  query: {
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "month",
          },
        ],
      ],
    },
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 2],
    aggregation: [["avg", ["field", "count", { "base-type": "type/Integer" }]]],
    breakout: [
      [
        "field",
        "CREATED_AT",
        { "base-type": "type/DateTime", "temporal-unit": "year" },
      ],
    ],
  },
};

describe("scenarios > dashboard > temporal unit parameters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("mapping targets", () => {
    it("should add a temporal unit parameter and connect it to a card", () => {
      cy.createDashboardWithQuestions({
        questions: [singleBreakoutQuestionDetails],
      }).then(({ dashboard }) => {
        visitDashboard(dashboard.id);
      });

      editDashboard();
      addTemporalUnitParameter();
      getDashboardCard().findByText("Select…").click();
      popover().findByText("Created At: Month").click();
      saveDashboard();
      getDashboardCard().findByText("Created At: Month").should("be.visible");

      filterWidget().click();
      popover().findByText("Year").click();
      getDashboardCard().findByText("Created At: Year").should("be.visible");
    });

    it("should allow to map to a question with multiple breakouts", () => {
      cy.createDashboardWithQuestions({
        questions: [multiBreakoutQuestionDetails],
      }).then(({ dashboard }) => {
        visitDashboard(dashboard.id);
      });

      editDashboard();
      addTemporalUnitParameter();
      getDashboardCard().findByText("Select…").click();
      popover().within(() => {
        cy.findByText("Created At: Month").should("be.visible");
        cy.findByText("Created At: Year").should("be.visible").click();
      });
      saveDashboard();
      filterWidget().click();
      popover().findByText("Quarter").click();
      getDashboardCard().within(() => {
        cy.findByText("Created At: Month").should("be.visible");
        cy.findByText("Q2 2022").should("be.visible");
      });
    });

    it("should not allow to map to a question without breakouts", () => {
      cy.createDashboardWithQuestions({
        questions: [noBreakoutQuestionDetails],
      }).then(({ dashboard }) => {
        visitDashboard(dashboard.id);
      });

      editDashboard();
      addTemporalUnitParameter();
      getDashboardCard().findByText("No valid fields").should("be.visible");
    });

    it("should allow to map to a question with multiple query stages", () => {
      cy.createDashboardWithQuestions({
        questions: [multiStageQuestionDetails],
      }).then(({ dashboard }) => {
        visitDashboard(dashboard.id);
      });

      editDashboard();
      addTemporalUnitParameter();
      getDashboardCard().findByText("Select…").click();
      popover().findByText("Created At: Month: Year").click();
      saveDashboard();
      filterWidget().click();
      popover().findByText("Quarter").click();
      getDashboardCard().findByText("Created At: Quarter").should("be.visible");
    });

    it("should allow to map to multiple breakout columns within one card", () => {
      cy.createDashboardWithQuestions({
        questions: [multiBreakoutQuestionDetails],
      }).then(({ dashboard }) => {
        visitDashboard(dashboard.id);
      });

      editDashboard();
      addTemporalUnitParameter();
      getDashboardCard().findByText("Select…").click();
      popover().findByText("Created At: Month").click();
      addTemporalUnitParameter();
      getDashboardCard().findByText("Select…").click();
      popover().findByText("Created At: Year").click();
      saveDashboard();
      filterWidget().eq(0).click();
      popover().findByText("Quarter").click();
      filterWidget().eq(1).click();
      popover().findByText("Week").click();
      getDashboardCard().within(() => {
        cy.findByText("Created At: Quarter").should("be.visible");
        cy.findByText("April 24, 2022").should("be.visible");
        cy.findByText("May 1, 2022").should("be.visible");
      });
    });

    it("should allow to map to multiple questions within on dashcard", () => {
      cy.createDashboard().then(({ body: dashboard }) => {
        createQuestion({
          ...singleBreakoutQuestionDetails,
          display: "line",
        }).then(({ body: card1 }) => {
          createQuestion({
            ...multiStageQuestionDetails,
            display: "line",
          }).then(({ body: card2 }) => {
            addOrUpdateDashboardCard({
              card_id: card1.id,
              dashboard_id: dashboard.id,
              card: {
                series: [
                  {
                    id: card2.id,
                  },
                ],
              },
            });
            visitDashboard(dashboard.id);
          });
        });
      });
      editDashboard();
      addTemporalUnitParameter();
      getDashboardCard()
        .findAllByText("Select…")
        .should("have.length", 2)
        .eq(0)
        .click();
      popover().findByText("Created At: Month").click();
      getDashboardCard().findByText("Select…").click();
      popover().findByText("Created At: Month: Year").click();
      saveDashboard();

      filterWidget().click();
      popover().findByText("Quarter").click();
      getDashboardCard().within(() => {
        cy.findByText(singleBreakoutQuestionDetails.name).should("be.visible");
        cy.findByText(multiStageQuestionDetails.name).should("be.visible");
        cy.findByText("Q1 2023").should("be.visible");
      });
    });
  });
});

function addTemporalUnitParameter() {
  cy.findByTestId("dashboard-header")
    .findByLabelText("Add a Unit of Time widget")
    .click();
}
