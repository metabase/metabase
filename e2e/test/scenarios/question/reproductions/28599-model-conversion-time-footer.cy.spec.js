import {
  modal,
  openQuestionActions,
  popover,
  restore,
} from "e2e/support/helpers";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

describe("issue 28599", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();

    cy.createQuestion(
      {
        name: "28599",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "year",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );

    cy.intercept("PUT", `/api/card/*`).as("updateCard");
  });

  it("should not show time granularity footer after question conversion to a model (metabase#28599)", () => {
    cy.findByTestId("timeseries-chrome").within(() => {
      cy.findByText(`View`).should("be.visible");
      cy.findByText(`All time`).should("be.visible");
      cy.findByText(`by`).should("be.visible");
      cy.findByText(`Year`).should("be.visible");
    });

    openQuestionActions();
    popover().findByText("Turn into a model").click();
    modal().findByText("Turn this into a model").click();

    cy.wait("@updateCard");

    cy.findByTestId("time-series-mode-bar").should("not.exist");
  });
});
