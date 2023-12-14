import {
  restore,
  setupSMTP,
  visitQuestion,
  openTable,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

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
      console.log(body);
      expect(body.channels).to.have.length(2);
      expect(body.channels[0].channel_type).to.eq("email");
      expect(body.channels[0].enabled).to.eq(false);
    });
  });

  it("should set up an email alert for newly created question", () => {
    openTable({
      table: PEOPLE_ID,
    });

    cy.icon("bell").click();

    cy.findByRole("dialog").within(() => {
      cy.findByLabelText("Name").type(" alert");
      cy.findByRole("button", { name: "Save" }).click();
    });

    cy.wait("@saveCard");

    cy.findByTestId("alert-education-screen").within(() => {
      cy.findByRole("button", { name: "Set up an alert" }).click();
    });
    cy.findByRole("button", { name: "Done" }).click();

    cy.wait("@savedAlert").then(({ response: { body } }) => {
      expect(body.channels[0].channel_type).to.eq("email");
      expect(body.channels[0].enabled).to.eq(true);
    });
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
