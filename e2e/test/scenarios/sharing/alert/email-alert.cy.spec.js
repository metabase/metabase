import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  modal,
  openSharingMenu,
  openTable,
  popover,
  restore,
  setupSMTP,
  visitQuestion,
} from "e2e/support/helpers";

const { PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > alert > email_alert", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/alert").as("savedAlert");
    cy.intercept("POST", "/api/card").as("saveCard");

    restore();
    cy.signInAsAdmin();
    cy.setCookie("metabase.SEEN_ALERT_SPLASH", "true");

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
    cy.request("PUT", "/api/setting/report-timezone", {
      value: "America/New_York",
    });

    openAlertForQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("alert-create").within(() => {
      cy.findByText(/Emails will be sent at 12:00 AM ET/).should("exist");

      // Turn off email
      toggleChannel("Email");
      cy.findByText(/Emails will be sent/).should("not.exist");
      cy.findByText(/Slack messages will be sent/).should("not.exist");

      // Turn on Slack
      toggleChannel("Slack");

      cy.findByText(/Slack messages will be sent at 12:00 AM ET/).should(
        "exist",
      );

      toggleChannel("Email");
      cy.findByText(
        /Emails and Slack messages will be sent at 12:00 AM ET/,
      ).should("exist");
      toggleChannel("Email");

      cy.button("Done").click();
    });

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

    openSharingMenu("Edit alerts");

    popover().within(() => {
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
  openSharingMenu("Create alert");
}

function toggleChannel(channel) {
  cy.findByText(channel).parent().find("input").click({ force: true });
}

function saveAlert() {
  openSharingMenu();

  modal().within(() => {
    cy.findByLabelText("Name").type(" alert");
    cy.button("Save").click();
  });
  cy.wait("@saveCard");

  openSharingMenu("Create alert");
  modal().button("Done").click();
}
