import { restore } from "__support__/e2e/helpers/e2e-setup-helpers";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

const TEST_QUESTION_QUERY = {
  "source-table": ORDERS_ID,
  aggregation: [["count"]],
  breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }]],
};

describe("scenarios > account > notifications", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("alerts", () => {
    beforeEach(() => {
      cy.getCurrentUser().then(({ body: { id: USER_ID } }) => {
        cy.createQuestion({
          name: "Question",
          query: TEST_QUESTION_QUERY,
        }).then(({ body: { id: CARD_ID } }) => {
          cy.createAlert({
            card: {
              id: CARD_ID,
              include_csv: false,
              include_xls: false,
            },
            channels: [
              {
                enabled: true,
                channel_type: "email",
                schedule_type: "hourly",
                recipients: [
                  {
                    id: USER_ID,
                  },
                ],
              },
            ],
          });
        });
      });
    });

    it("should be able to see help info", () => {
      cy.visit("/account/notifications");

      cy.findByText("Not seeing one here?").click();
      cy.findByText("Not seeing something listed here?");
      cy.findByText("Got it").click();
      cy.findByText("Not seeing something listed here?").should("not.exist");
    });

    it("should be able to see alerts notifications", () => {
      cy.visit("/account/notifications");

      cy.findByText("Question");
      cy.findByText("Emailed hourly", { exact: false });
      cy.findByText("Created by you", { exact: false });
    });

    it("should be able to unsubscribe and delete an alert", () => {
      cy.findByText("Question");
      cy.findByLabelText("close icon").click();

      cy.findByText("Confirm you want to unsubscribe");
      cy.findByText("Unsubscribe").click();
      cy.findByText("Unsubscribe").should("not.exist");

      cy.findByText("Question");
      cy.findByLabelText("close icon").click();

      cy.findByText("Delete this alert?");
      cy.findByText("Yes, delete this alert").click();
      cy.findByText("Yes, delete this alert").should("not.exist");

      cy.findByText("Question").should("not.exist");
    });
  });
});
