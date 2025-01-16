import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_MODEL_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const channels = {
  slack: {
    setup: cy.mockSlackConfigured,
    createAlert: () => {
      cy.toggleAlertChannel("Email");
      cy.toggleAlertChannel("Slack");
      cy.findByPlaceholderText(/Pick a user or channel/).click();
      cy.popover().findByText("#work").click();
    },
  },
  email: { setup: cy.setupSMTP, createAlert: () => {} },
};

describe("scenarios > alert", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  describe("with nothing set", () => {
    it("should prompt you to add email/slack credentials", () => {
      cy.visitQuestion(ORDERS_QUESTION_ID);
      cy.openSharingMenu("Create alert");

      cy.modal().within(() => {
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

      cy.visitQuestion(ORDERS_QUESTION_ID);
      cy.openSharingMenu("Create alert");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "To send alerts, an admin needs to set up email integration.",
      );
    });
  });

  Object.entries(channels).forEach(([channel, config]) => {
    describe(`with ${channel} set up`, { tags: "@external" }, () => {
      beforeEach(config.setup);

      it("educational screen should show for the first alert, but not for the second", () => {
        cy.intercept("POST", "/api/alert").as("savedAlert");
        cy.intercept("POST", `/api/card/${ORDERS_COUNT_QUESTION_ID}/query`).as(
          "questionLoaded",
        );

        // Open the first alert screen and create an alert
        cy.visitQuestion(ORDERS_QUESTION_ID);
        cy.openSharingMenu("Create alert");

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

        config.createAlert();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Done").click();

        cy.wait("@savedAlert");

        // Open the second alert screen
        cy.visitQuestion(ORDERS_COUNT_QUESTION_ID);
        cy.wait("@questionLoaded");

        cy.openSharingMenu("Create alert");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Let's set up your alert");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("The wide world of alerts").should("not.exist");
      });
    });
  });

  describe("with a webhook", { tags: ["@external"] }, () => {
    beforeEach(() => {
      cy.setupNotificationChannel({
        name: "Foo Hook",
        description: "This is a hook",
      });
      cy.setupNotificationChannel({
        name: "Bar Hook",
        description: "This is another hook",
      });
      cy.setCookie("metabase.SEEN_ALERT_SPLASH", "true");
    });

    it("should be able to create and delete alerts with webhooks enabled", () => {
      cy.visitQuestion(ORDERS_QUESTION_ID);
      cy.openSharingMenu("Create alert");

      //Disable Email
      cy.toggleAlertChannel("Email");
      cy.toggleAlertChannel("Foo Hook");
      cy.toggleAlertChannel("Bar Hook");

      cy.findByRole("button", { name: "Done" }).click();

      cy.openSharingMenu("Edit alerts");

      cy.popover().within(() => {
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
    cy.visitModel(ORDERS_MODEL_ID);
    cy.findByTestId("view-footer").within(() => {
      cy.findByTestId("question-row-count")
        .should("have.text", "Showing first 2,000 rows")
        .and("be.visible");
      cy.icon("download").should("exist");
    });

    cy.sharingMenuButton().should("not.exist");
  });

  it("can set up an alert for a question saved in a dashboard", () => {
    cy.setupSMTP();

    cy.createQuestion(
      {
        name: "Total Orders",
        database_id: SAMPLE_DATABASE.id,
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      },
      { visitQuestion: true },
    );

    cy.openSharingMenu("Create alert");
    cy.modal().button("Set up an alert").click();
    cy.modal().button("Done").click();

    cy.openSharingMenu("Edit alerts");
    cy.popover().findByText("You set up an alert").should("be.visible");
  });
});
