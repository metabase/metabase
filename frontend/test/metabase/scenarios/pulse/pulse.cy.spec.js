import { signInAsAdmin, restore } from "__support__/cypress";

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
  before(restore);
  beforeEach(signInAsAdmin);
  it("should be able get to the new pulse page from the nav bar", () => {
    cy.visit("/");

    cy.get(".Icon-add").click();
    cy.contains("New pulse").click();

    cy.url().should("match", /\/pulse\/create$/);
  });

  it("should create a new pulse", () => {
    cy.server();
    cy.route("GET", "/api/pulse/form_input", MOCK_PULSE_FORM_INPUT);

    cy.visit("/pulse/create");

    cy.get('[placeholder="Important metrics"]')
      .wait(100)
      .type("pulse title");

    cy.contains("Select a question").click();
    cy.contains("Orders, Count").click();

    // pulse card preview
    cy.contains("18,760");

    cy.contains("Create pulse").click();

    cy.url().should("match", /\/collection\/root$/);
    cy.contains("pulse title");
  });

  it("should load existing pulses", () => {
    cy.visit("/collection/root");
    cy.contains("pulse title").click({ force: true });
    cy.contains("18,760");
  });

  it("should edit existing pulses", () => {
    cy.visit("/pulse/1");
    cy.get('[placeholder="Important metrics"]')
      .clear()
      .type("new pulse title");

    cy.contains("Save changes").click();
    cy.url().should("match", /\/collection\/root$/);
    cy.contains("new pulse title");
  });
});
