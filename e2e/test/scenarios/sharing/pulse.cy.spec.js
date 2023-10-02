import { restore, setupSMTP } from "e2e/support/helpers";

import { ORDERS_COUNT_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

describe("scenarios > pulse", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();
  });

  it("should create a new pulse", () => {
    cy.visit("/pulse/create");

    cy.findByPlaceholderText("Important metrics").click().type("pulse title");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a question").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Orders, Count").click();

    cy.findByPlaceholderText("Enter user names or email addresses")
      .type("bobby@example.test")
      .blur();

    // pulse card preview
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("18,760");

    cy.button("Create pulse").click();

    cy.url().should(
      "match",
      /\/collection\/\d+-bobby-tables-s-personal-collection$/,
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("pulse title");
  });

  describe("existing pulses", () => {
    beforeEach(() => {
      // Create new pulse without relying on the previous test
      cy.request("POST", "/api/pulse", {
        name: "pulse title",
        cards: [
          {
            id: ORDERS_COUNT_QUESTION_ID,
            include_csv: false,
            include_xls: false,
          },
        ],
        channels: [
          {
            channel_type: "email",
            details: {},
            enabled: true,
            recipients: [{ email: "bobby@example.test" }],
            schedule_day: "mon",
            schedule_frame: "first",
            schedule_hour: 8,
            schedule_type: "daily",
          },
        ],
        skip_if_empty: false,
      });
    });

    it("should load existing pulses", () => {
      cy.visit("/collection/root");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("pulse title").click({ force: true });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("18,760");
    });

    it("should edit existing pulses", () => {
      cy.visit("/pulse/1");
      cy.findByPlaceholderText("Important metrics")
        .click()
        .clear()
        .type("new pulse title");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Save changes").click();
      cy.url().should("match", /\/collection\/root$/);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("new pulse title");
    });
  });
});
