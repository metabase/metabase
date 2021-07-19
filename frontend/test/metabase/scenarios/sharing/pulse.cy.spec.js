import { restore } from "__support__/e2e/cypress";

const MOCK_PULSE_FORM_INPUT = {
  channels: {
    email: {
      type: "email",
      name: "Email",
      allows_recipients: true,
      configured: true,
      recipients: ["user", "email"],
      schedules: ["daily", "weekly", "monthly"],
    },
  },
};

describe("scenarios > pulse", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });
  it("should be able get to the new pulse page from the nav bar", () => {
    cy.visit("/");

    cy.icon("add").click();
    cy.contains("New pulse").click();

    cy.url().should("match", /\/pulse\/create$/);
  });

  it("should create a new pulse", () => {
    cy.server();
    cy.route("GET", "/api/pulse/form_input", MOCK_PULSE_FORM_INPUT);

    cy.visit("/pulse/create");

    cy.findByPlaceholderText("Important metrics")
      .click()
      .type("pulse title");

    cy.contains("Select a question").click();
    cy.contains("Orders, Count").click();
    cy.findByPlaceholderText("Enter user names or email addresses")
      .type("bobby@example.test")
      .blur();

    // pulse card preview
    cy.contains("18,760");

    cy.contains("Create pulse").click();

    cy.url().should("match", /\/collection\/root$/);
    cy.contains("pulse title");
  });

  describe("existing pulses", () => {
    beforeEach(() => {
      // Create new pulse without relying on the previous test
      cy.request("POST", "/api/pulse", {
        name: "pulse title",
        cards: [{ id: 2, include_csv: false, include_xls: false }],
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
      cy.contains("pulse title").click({ force: true });
      cy.contains("18,760");
    });

    it("should edit existing pulses", () => {
      cy.visit("/pulse/1");
      cy.findByPlaceholderText("Important metrics")
        .click()
        .clear()
        .type("new pulse title");

      cy.contains("Save changes").click();
      cy.url().should("match", /\/collection\/root$/);
      cy.contains("new pulse title");
    });
  });
});
