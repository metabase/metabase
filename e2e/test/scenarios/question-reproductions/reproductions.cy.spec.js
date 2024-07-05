import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  getNotebookStep,
  openNotebook,
  popover,
  restore,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 39771", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should show tooltip for ellipsified text (metabase#39771)", () => {
    createQuestion(
      {
        query: {
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              "CREATED_AT",
              {
                "base-type": "type/DateTime",
                "temporal-unit": "quarter-of-year",
              },
            ],
          ],
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
        },
      },
      { visitQuestion: true },
    );

    openNotebook();
    getNotebookStep("summarize", { stage: 1 })
      .findByTestId("breakout-step")
      .findByText("Created At: Month: Quarter of year")
      .click();

    popover().findByText("by quarter of year").realHover();

    popover().then(([$popover]) => {
      const popoverStyle = window.getComputedStyle($popover);
      const popoverZindex = parseInt(popoverStyle.zIndex, 10);

      cy.findByTestId("ellipsified-tooltip").within(([$tooltip]) => {
        cy.findByText("by quarter of year").should("be.visible");

        const tooltipStyle = window.getComputedStyle($tooltip);
        const tooltipZindex = parseInt(tooltipStyle.zIndex, 10);

        // resort to asserting zIndex because should("be.visible") passes unexpectedly
        expect(tooltipZindex).to.be.gte(popoverZindex);
      });
    });
  });
});
