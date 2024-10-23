import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  mockSlackConfigured,
  modal,
  openSharingMenu,
  popover,
  restore,
  setupNotificationChannel,
  setupSMTP,
  sharingMenuButton,
  toggleAlertChannel,
  visitModel,
  visitQuestion,
} from "e2e/support/helpers";

const channels = { slack: mockSlackConfigured, email: setupSMTP };

describe("scenarios > alert", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("with nothing set", () => {
    it("should prompt you to add email/slack credentials", () => {
      visitQuestion(ORDERS_QUESTION_ID);
      openSharingMenu("Create alert");

      modal().within(() => {
        cy.findByText(
          "To send alerts, you'll need to set up email, Slack or Webhook integration.",
        );

        cy.findByRole("link", { name: "Configure email" }).should(
          "have.attr",
          "href",
          "/admin/settings/email",
        );
        cy.findByRole("link", { name: "Configure Slack" }).should(
          "have.attr",
          "href",
          "/admin/settings/notifications/slack",
        );
        cy.findByRole("link", { name: "Configure webhook" }).should(
          "have.attr",
          "href",
          "/admin/settings/notifications",
        );
      });
    });

    it("should say to non-admins that admin must add email credentials", () => {
      cy.signInAsNormalUser();

      visitQuestion(ORDERS_QUESTION_ID);
      openSharingMenu("Create alert");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "To send alerts, an admin needs to set up email integration.",
      );
    });
  });

  Object.entries(channels).forEach(([channel, setup]) => {
    describe(`with ${channel} set up`, { tags: "@external" }, () => {
      beforeEach(setup);

      it("educational screen should show for the first alert, but not for the second", () => {
        cy.intercept("POST", "/api/alert").as("savedAlert");
        cy.intercept("POST", `/api/card/${ORDERS_COUNT_QUESTION_ID}/query`).as(
          "questionLoaded",
        );

        // Open the first alert screen and create an alert
        visitQuestion(ORDERS_QUESTION_ID);
        openSharingMenu("Create alert");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("The wide world of alerts");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("There are a few different kinds of alerts you can get");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("When a raw data question returns any results");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("When a line or bar crosses a goal line");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("When a progress bar reaches its goal");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Set up an alert").click();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Done").click();

        cy.wait("@savedAlert");

        // Open the second alert screen
        visitQuestion(ORDERS_COUNT_QUESTION_ID);
        cy.wait("@questionLoaded");

        openSharingMenu("Create alert");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Let's set up your alert");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("The wide world of alerts").should("not.exist");
      });
    });
  });

  describe("with a webhook", { tags: ["@external"] }, () => {
    beforeEach(() => {
      setupNotificationChannel({
        name: "Foo Hook",
        description: "This is a hook",
      });
      setupNotificationChannel({
        name: "Bar Hook",
        description: "This is another hook",
      });
      cy.setCookie("metabase.SEEN_ALERT_SPLASH", "true");
    });

    it("should be able to create and delete alerts with webhooks enabled", () => {
      visitQuestion(ORDERS_QUESTION_ID);
      openSharingMenu("Create alert");

      //Disable Email
      toggleAlertChannel("Email");
      toggleAlertChannel("Foo Hook");
      toggleAlertChannel("Bar Hook");

      cy.findByRole("button", { name: "Done" }).click();

      openSharingMenu("Edit alerts");

      popover().within(() => {
        cy.findByText("You set up an alert").should("be.visible");
        cy.findByRole("listitem", { name: "Number of HTTP channels" })
          .should("contain.text", "2")
          .findByRole("img", { name: /webhook/i })
          .should("exist");
        cy.findByText("Edit").click();
      });

      cy.findByRole("button", { name: "Delete this alert" }).click();

      cy.log(
        "Webhooks should render with their given names in delete modal metabase#48428",
      );
      cy.findByRole("checkbox", { name: /Channel Foo Hook/ }).click();
      cy.findByRole("checkbox", { name: /Channel Bar Hook/ }).click();

      cy.findByRole("button", { name: "Delete this alert" }).click();
    });
  });

  it("should not be offered for models (metabase#37893)", () => {
    visitModel(ORDERS_MODEL_ID);
    cy.findByTestId("view-footer").within(() => {
      cy.findByTestId("question-row-count")
        .should("have.text", "Showing first 2,000 rows")
        .and("be.visible");
      cy.icon("download").should("exist");
    });

    sharingMenuButton().should("not.exist");
  });
});
