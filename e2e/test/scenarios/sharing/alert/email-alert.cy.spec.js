const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > alert > email_alert", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/notification").as("saveAlert");
    cy.intercept("POST", "/api/card").as("saveCard");

    H.restore();
    cy.signInAsAdmin();
    cy.setCookie("metabase.SEEN_ALERT_SPLASH", "true");

    H.setupSMTP();
  });

  it("should have no alerts set up initially", () => {
    cy.visit("/");

    cy.request("/api/notification").then(({ body }) => {
      const questionAlerts = body.filter(
        notification => notification.payload_type === "notification/card",
      );
      expect(questionAlerts).to.have.length(0);
    });
  });

  it("should set up an email alert", () => {
    openAlertForQuestion(ORDERS_QUESTION_ID);

    cy.log(
      "Should not display slack channel if it is not configured metabase#48407",
    );
    cy.findByTestId("alert-create").within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Slack").should("not.exist");
    });

    cy.button("Done").click();

    cy.wait("@saveAlert").then(({ response: { body } }) => {
      expect(body.handlers).to.have.length(1);
      expect(body.handlers[0].channel_type).to.eq("channel/email");
    });
  });

  it("should respect email alerts toggled off (metabase#12349)", () => {
    H.updateSetting("report-timezone", "America/New_York");

    //For this test, we need to pretend that slack is set up
    H.mockSlackConfigured();
    H.setupNotificationChannel({ name: "Webhook" });

    openAlertForQuestion(ORDERS_QUESTION_ID);

    H.removeNotificationHandlerChannel("Email");

    H.addNotificationHandlerChannel("Slack", { hasNoChannelsAdded: true });

    H.modal()
      .findByPlaceholderText(/Pick a user or channel/)
      .click();

    H.popover().findByText("#work").click();

    H.addNotificationHandlerChannel("Email");

    H.removeNotificationHandlerChannel("Email");

    H.modal().within(() => {
      cy.button("Done").click();
    });

    cy.wait("@saveAlert").then(({ response: { body } }) => {
      expect(body.handlers).to.have.length(1);
      expect(body.handlers[0].channel_type).to.eq("channel/slack");
    });

    cy.log(
      "ensure that when the alert is deleted, the delete modal is correct metabase#48402",
    );
    H.openSharingMenu("Edit alerts");
    H.modal().within(() => {
      cy.findByText("Edit alerts").should("be.visible");
      cy.findByText(/Created by you/).realHover();
    });

    cy.findByRole("button", { name: "Delete this alert" }).click();
  });

  it("should set up an email alert for newly created question", () => {
    H.openTable({
      table: PEOPLE_ID,
    });

    saveAlert();

    cy.findByTestId("toast-undo")
      .findByText("Your alert is all set up.")
      .should("be.visible");

    cy.wait("@saveAlert").then(({ response: { body } }) => {
      expect(body.handlers[0].channel_type).to.eq("channel/email");
    });
  });

  it("should enable alert to be updated (without updating question) (metabase#36866)", () => {
    H.openTable({
      table: PEOPLE_ID,
    });

    saveAlert();

    cy.log("Check that /api/card has been called once");
    cy.get("@saveCard.all").should("have.length", 1);

    cy.findByTestId("toast-undo")
      .findByText("Your alert is all set up.")
      .should("be.visible");

    H.openSharingMenu("Edit alerts");

    H.modal().within(() => {
      cy.findByText("Edit alerts").should("be.visible");
      cy.findByText(/Created by you/).click();
    });

    cy.log("Change the frequency of the alert to weekly");

    H.modal().findByTestId("select-frequency").click();

    cy.findByRole("option", { name: /weekly/i })
      .should("have.attr", "value", "weekly")
      .should("have.attr", "aria-selected", "false")
      .click();
    cy.button("Save changes").click();

    cy.log("Check that /api/card has still only been called once");
    cy.get("@saveCard.all").should("have.length", 1);
  });
});

function openAlertForQuestion(id) {
  H.visitQuestion(id);
  H.openSharingMenu("Create an alert");
}

function saveAlert() {
  H.openSharingMenu();

  H.modal().within(() => {
    cy.findByLabelText("Name").type(" alert");
    cy.button("Save").click();
  });
  cy.wait("@saveCard");

  H.openSharingMenu("Create an alert");
  H.modal().button("Done").click();
}
