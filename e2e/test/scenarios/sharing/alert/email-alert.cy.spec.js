import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  mockSlackConfigured,
  modal,
  openSharingMenu,
  openTable,
  popover,
  restore,
  setupNotificationChannel,
  setupSMTP,
  toggleAlertChannel,
  updateSetting,
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

    cy.log(
      "Should not display slack channel if it is not configured metabase#48407",
    );
    cy.findByTestId("alert-create").within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByRole("heading", { name: "Slack" }).should("not.exist");
    });

    cy.button("Done").click();

    cy.wait("@savedAlert").then(({ response: { body } }) => {
      expect(body.channels).to.have.length(1);
      expect(body.channels[0].channel_type).to.eq("email");
      expect(body.channels[0].enabled).to.eq(true);
    });
  });

  it("should respect email alerts toggled off (metabase#12349)", () => {
    updateSetting("report-timezone", "America/New_York");

    //For this test, we need to pretend that slack is set up
    mockSlackConfigured();
    setupNotificationChannel({ name: "Webhook" });

    openAlertForQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("alert-create").within(() => {
      cy.findByText(/Emails will be sent at 12:00 AM ET/).should("exist");

      // Turn off email
      toggleAlertChannel("Email");
      cy.findByText(/Emails will be sent/).should("not.exist");
      cy.findByText(/Slack messages will be sent/).should("not.exist");

      // Turn on Slack
      toggleAlertChannel("Slack");
      cy.findByPlaceholderText(/Pick a user or channel/).click();
    });

    popover().findByText("#work").click();

    cy.findByTestId("alert-create").within(() => {
      cy.findByText(/Slack messages will be sent at 12:00 AM ET/).should(
        "exist",
      );

      toggleAlertChannel("Email");
      cy.findByText(
        /Emails and Slack messages will be sent at 12:00 AM ET/,
      ).should("exist");
      toggleAlertChannel("Email");

      cy.button("Done").click();
    });

    cy.wait("@savedAlert").then(({ response: { body } }) => {
      expect(body.channels).to.have.length(2);
      expect(body.channels[0].channel_type).to.eq("email");
      expect(body.channels[0].enabled).to.eq(false);
    });

    cy.log(
      "ensure that when the alert is deleted, the delete modal is correct metabase#48402",
    );
    openSharingMenu("Edit alerts");
    popover().within(() => {
      cy.findByText("You set up an alert").should("be.visible");
      cy.findByText("Edit").click();
    });

    cy.findByRole("button", { name: "Delete this alert" }).click();
    cy.findByRole("checkbox", { name: /be emailed to / }).should("not.exist");
    cy.findByRole("checkbox", { name: /Slack channel / }).should("exist");
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
