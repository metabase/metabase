import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  setupSMTP,
  visitQuestion,
  openTable,
} from "e2e/support/helpers";

const { PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > alert > email_alert", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/alert").as("savedAlert");
    cy.intercept("POST", "/api/card").as("saveCard");

    restore();
    cy.signInAsAdmin();

    setupSMTP();
  });

  it("should have no alerts set up initially", () => {
    cy.visit("/");

    cy.request("/api/alert").then(({ body }) => {
      expect(body).to.have.length(0);
    });
  });

  it("should set up an email alert", () => {
    openAlertForQuestion(ORDERS_QUESTION_ID);
    cy.button("Done").click();

    cy.wait("@savedAlert").then(({ response: { body } }) => {
      expect(body.channels).to.have.length(1);
      expect(body.channels[0].channel_type).to.eq("email");
      expect(body.channels[0].enabled).to.eq(true);
    });
  });

  it("should respect email alerts toggled off (metabase#12349)", () => {
    openAlertForQuestion(ORDERS_QUESTION_ID);

    // Turn off email
    toggleChannel("Email");

    // Turn on Slack
    toggleChannel("Slack");

    cy.button("Done").click();

    cy.wait("@savedAlert").then(({ response: { body } }) => {
      expect(body.channels).to.have.length(2);
      expect(body.channels[0].channel_type).to.eq("email");
      expect(body.channels[0].enabled).to.eq(false);
    });
  });

  it("should set up an email alert for newly created question", () => {
    openTable({
      table: PEOPLE_ID,
    });

    saveAlert();

    cy.findByTestId("toast-undo")
      .findByText("Your alert is all set up.")
      .should("be.visible");

    cy.wait("@savedAlert").then(({ response: { body } }) => {
      expect(body.channels[0].channel_type).to.eq("email");
      expect(body.channels[0].enabled).to.eq(true);
    });
  });

  it("should enable alert to be updated (without updating question) (metabase#36866)", () => {
    openTable({
      table: PEOPLE_ID,
    });

    saveAlert();

    cy.log("Check that /api/card has been called once");
    cy.get("@saveCard.all").should("have.length", 1);

    cy.findByTestId("toast-undo")
      .findByText("Your alert is all set up.")
      .should("be.visible");

    clickAlertBell();

    cy.findByTestId("popover").within(() => {
      cy.findByText("You set up an alert").should("be.visible");
      cy.findByText("Edit").click();
    });

    cy.log("Change the frequency of the alert to weekly");

    cy.findByTestId("alert-edit")
      .findByText("How often should we check for results?")
      .parent()
      .parent()
      .findAllByTestId("select-button")
      .should("have.length", 2)
      .eq(0)
      .click();

    cy.findByRole("option", { name: "Weekly" })
      .should("have.attr", "aria-selected", "false")
      .click();
    cy.button("Save changes").click();

    cy.log("Check that /api/card has still only been called once");
    cy.get("@saveCard.all").should("have.length", 1);
  });
});

function openAlertForQuestion(id) {
  visitQuestion(id);
  cy.icon("bell").click();
  cy.findByText("Set up an alert").click();
}

function toggleChannel(channel) {
  cy.findByText(channel).parent().find("input").click();
}

function clickAlertBell() {
  cy.findByTestId("view-footer").icon("bell").click();
}

function saveAlert() {
  clickAlertBell();

  cy.findByRole("dialog").within(() => {
    cy.findByLabelText("Name").type(" alert");
    cy.button("Save").click();
  });

  cy.wait("@saveCard");

  cy.findByTestId("alert-education-screen").within(() => {
    cy.button("Set up an alert").click();
  });
  cy.button("Done").click();
}
