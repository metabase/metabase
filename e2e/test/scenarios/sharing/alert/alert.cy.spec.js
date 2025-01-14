import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_MODEL_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("scenarios > alert", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("with nothing set", () => {
    it("should prompt you to add email/slack credentials", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openNotificationsMenu("Create subscriptions");

      H.modal()
        .first()
        .within(() => {
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

      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openNotificationsMenu("Create subscriptions");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "To send alerts, an admin needs to set up email integration.",
      );
    });
  });

  describe("with a webhook", { tags: ["@external"] }, () => {
    beforeEach(() => {
      H.setupNotificationChannel({
        name: "Foo Hook",
        description: "This is a hook",
      });
      H.setupNotificationChannel({
        name: "Bar Hook",
        description: "This is another hook",
      });
      cy.setCookie("metabase.SEEN_ALERT_SPLASH", "true");
    });

    it("should be able to create and delete alerts with webhooks enabled", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openNotificationsMenu("Create subscriptions");

      //Disable Email
      H.toggleAlertChannel("Email");
      H.toggleAlertChannel("Foo Hook");
      H.toggleAlertChannel("Bar Hook");

      cy.findByRole("button", { name: "Done" }).click();

      H.openNotificationsMenu("Edit subscriptions");

      H.modal().within(() => {
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
    H.visitModel(ORDERS_MODEL_ID);
    cy.findByTestId("view-footer").within(() => {
      cy.findByTestId("question-row-count")
        .should("have.text", "Showing first 2,000 rows")
        .and("be.visible");
      cy.icon("download").should("exist");
    });

    H.notificationsMenuButton().should("not.exist");
  });

  it("can set up an alert for a question saved in a dashboard", () => {
    H.setupSMTP();

    H.createQuestion(
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

    H.openNotificationsMenu("Create subscriptions");
    H.modal().button("Done").click();

    H.openNotificationsMenu("Edit subscriptions");
    H.modal().findByText("You set up an alert").should("be.visible");
  });

  it("should reload alerts from server after question change", () => {
    // TODO: implement
  });
});

H.describeEE(
  "scenarios > sharing > approved domains (EE)",
  { tags: "@external" },
  () => {
    const allowedDomain = "metabase.test";
    const deniedDomain = "metabase.example";
    const deniedEmail = `mailer@${deniedDomain}`;
    const subscriptionError = `You're only allowed to email subscriptions to addresses ending in ${allowedDomain}`;
    const alertError = `You're only allowed to email alerts to addresses ending in ${allowedDomain}`;

    function addEmailRecipient(email) {
      cy.findByRole("textbox").click().type(`${email}`).blur();
    }

    function setAllowedDomains() {
      H.updateSetting("subscription-allowed-domains", allowedDomain);
    }

    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
      H.setupSMTP();
      setAllowedDomains();
    });

    it("should validate approved email domains for a question alert", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);

      H.openNotificationsMenu("Create subscriptions");

      H.modal()
        .findByRole("heading", { name: "Email" })
        .closest("li")
        .within(() => {
          addEmailRecipient(deniedEmail);
          cy.findByText(alertError);
        });
      cy.button("Done").should("be.disabled");
    });

    it("should validate approved email domains for a dashboard subscription (metabase#17977)", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.openNotificationsMenu("Subscriptions");

      cy.findByRole("heading", { name: "Email it" }).click();

      H.sidebar().within(() => {
        addEmailRecipient(deniedEmail);

        // Reproduces metabase#17977
        cy.button("Send email now").should("be.disabled");
        cy.button("Done").should("be.disabled");
        cy.findByText(subscriptionError);
      });
    });
  },
);
