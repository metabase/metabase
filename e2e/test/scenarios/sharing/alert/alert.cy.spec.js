const { H } = cy;
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

      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Create an alert").click();

      H.modal().within(() => {
        cy.findByText(
          "To get notified when something happens, or to send this chart on a schedule, first set up email, Slack, or a webhook.",
        );

        cy.findByText("Set up email")
          .should("be.visible")
          .closest("a")
          .should("have.attr", "href", "/admin/settings/email");
        cy.findByText("Set up Slack")
          .should("be.visible")
          .closest("a")
          .should("have.attr", "href", "/admin/settings/notifications");
        cy.findByText("Add a webhook")
          .should("be.visible")
          .closest("a")
          .should("have.attr", "href", "/admin/settings/notifications");
      });
    });

    it("should say to non-admins that admin must add email credentials", () => {
      cy.signInAsNormalUser();

      H.visitQuestion(ORDERS_QUESTION_ID);

      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Create an alert").click();

      H.modal().within(() => {
        cy.findByText(
          "To get notified when something happens, or to send this chart on a schedule, ask your admin to set up email, Slack, or a webhook.",
        );

        cy.findByText("Set up email").should("not.exist");
        cy.findByText("Set up Slack").should("not.exist");
        cy.findByText("Add a webhook").should("not.exist");
      });
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

      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Create an alert").click();

      H.addNotificationHandlerChannel("Bar Hook");

      cy.findByRole("button", { name: "Done" }).click();

      H.notificationList().findByText("Your alert is all set up.");

      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Edit alerts").click();

      H.modal().within(() => {
        cy.findByText("Edit alerts").should("be.visible");

        cy.icon("webhook").should("be.visible");

        cy.findByText(/Created by you/)
          .should("be.visible")
          .realHover();

        cy.icon("trash").click();
      });

      cy.findByRole("button", { name: "Delete it" }).click();
      H.notificationList().findByText("The alert was successfully deleted.");

      // delete modal should close
      H.modal().should("not.exist");
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

    H.sharingMenuButton().should("not.exist");
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

    cy.findByLabelText("Move, duplicate, and more…").click();
    H.popover().findByText("Create an alert").click();
    H.modal().button("Done").click();

    cy.findByLabelText("Move, duplicate, and more…").click();
    H.popover().findByText("Edit alerts").click();
    H.modal().within(() => {
      cy.findByText("Edit alerts").should("be.visible");
      cy.findByText(/Created by you/).should("be.visible");
    });
  });

  describe(
    "scenarios > sharing > approved domains (EE)",
    { tags: "@external" },
    () => {
      const allowedDomain = "metabase.test";
      const deniedDomain = "metabase.example";
      const deniedEmail = `mailer@${deniedDomain}`;
      // We're not exposing allowed domains to normal users.
      const normalUserAlertError = `Failed save alert. The following email addresses are not allowed: ${deniedEmail}`;
      const normalUserSubscriptionError = `Cannot create subscription. The following email addresses are not allowed: ${deniedEmail} Please contact your administrator.`;
      const adminAlertError = `You're only allowed to email alerts to addresses ending in ${allowedDomain}`;
      const adminSubscriptionError = `You're only allowed to email subscriptions to addresses ending in ${allowedDomain}`;

      function addEmailRecipient(email) {
        cy.findByRole("textbox").click().type(`${email}`).blur();
      }

      function setAllowedDomains() {
        H.updateSetting("subscription-allowed-domains", allowedDomain);
      }

      beforeEach(() => {
        H.restore();
        cy.signInAsAdmin();
        H.activateToken("pro-self-hosted");
        H.setupSMTP();
        setAllowedDomains();
      });

      it("should validate approved email domains for a question alert", () => {
        H.visitQuestion(ORDERS_QUESTION_ID);

        cy.findByLabelText("Move, trash, and more…").click();
        H.popover().findByText("Create an alert").click();

        H.modal().within(() => {
          cy.findByText("New alert").should("be.visible");

          cy.findByTestId("token-field").within(() => {
            addEmailRecipient(deniedEmail);
          });

          cy.findByText(adminAlertError);
          cy.button("Done").should("be.disabled");
        });
      });

      it("should validate approved email domains for a dashboard subscription (metabase#17977)", () => {
        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.openSharingMenu("Subscriptions");

        H.sidebar().within(() => {
          cy.findByText("Email it").click();
          addEmailRecipient(deniedEmail);

          // Reproduces metabase#17977
          cy.button("Send email now").should("be.disabled");
          cy.button("Done").should("be.disabled");
          cy.findByText(adminSubscriptionError);
        });
      });

      it("should not display the list of approved domains for non-admins (metabase#57138)", () => {
        cy.signInAsNormalUser();
        H.visitQuestion(ORDERS_QUESTION_ID);

        cy.findByLabelText("Move, trash, and more…").click();
        H.popover().findByText("Create an alert").click();
        H.modal().within(() => {
          cy.findByText("New alert").should("be.visible");

          cy.findByTestId("token-field").within(() => {
            addEmailRecipient(deniedEmail);
          });

          cy.button("Done").click();
        });
        cy.findByTestId("toast-undo").within(() => {
          cy.root().should("have.attr", "color", "error");
          cy.root().should("have.text", normalUserAlertError);
        });

        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.openSharingMenu("Subscriptions");

        H.sidebar().within(() => {
          addEmailRecipient(deniedEmail);

          cy.button("Done").click();
        });
        cy.findByTestId("toast-undo").within(() => {
          cy.root().should("have.attr", "color", "error");
          cy.root().should("have.text", normalUserSubscriptionError);
        });
      });
    },
  );
});
