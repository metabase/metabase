import { ORDERS_COUNT_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { restore, setupSMTP, popover } from "e2e/support/helpers";

describe("scenarios > pulse", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();
  });

  it("should create a new pulse", () => {
    const pulseTitle = "Foo";

    cy.intercept("GET", "/api/user/recipients").as("recipients");
    cy.visit("/pulse/create");
    cy.wait("@recipients");

    cy.get("main").findByText("Pulses are being phased out");

    cy.findByRole("heading", { name: "Name your pulse" })
      .parent()
      .within(() => {
        cy.findByPlaceholderText("Important metrics").type(pulseTitle).blur();
        cy.findByDisplayValue(pulseTitle);
      });

    cy.findByRole("heading", { name: "Pick your data" })
      .parent()
      .as("pulseData")
      .within(() => {
        cy.findByTestId("select-button").contains("Select a question").click();
      });

    popover().findByText("Orders, Count").click();

    cy.findByRole("heading", { name: "Where should this data go?" })
      .parent()
      .within(() => {
        cy.findByPlaceholderText("Enter user names or email addresses")
          .type("bobby@example.test")
          .blur();
      });

    cy.button("Create pulse").click();

    cy.url().should(
      "match",
      /\/collection\/\d+-bobby-tables-s-personal-collection$/,
    );

    cy.findAllByTestId("collection-entry-name").should("contain", pulseTitle);
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
