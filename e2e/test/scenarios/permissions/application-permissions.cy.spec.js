import {
  restore,
  modal,
  describeEE,
  modifyPermission,
  getFullName,
  visitQuestion,
  visitDashboard,
} from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

const SETTINGS_INDEX = 0;
const MONITORING_INDEX = 1;
const SUBSCRIPTIONS_INDEX = 2;

const NORMAL_USER_ID = 2;
const { admin } = USERS;

describeEE("scenarios > admin > permissions > application", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("subscriptions permission", () => {
    describe("revoked", () => {
      beforeEach(() => {
        cy.visit("/admin/permissions/application");

        modifyPermission("All Users", SUBSCRIPTIONS_INDEX, "No");

        cy.button("Save changes").click();

        modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        createSubscription(NORMAL_USER_ID);

        cy.signInAsNormalUser();
      });

      it("revokes ability to create subscriptions and alerts and manage them", () => {
        visitDashboard(1);
        cy.icon("subscription").should("not.exist");

        visitQuestion(ORDERS_QUESTION_ID);
        cy.icon("bell").should("not.exist");

        cy.visit("/account/notifications");
        cy.findByTestId("notifications-list").within(() => {
          cy.icon("close").should("not.exist");
        });
      });
    });

    describe("granted", () => {
      beforeEach(() => {
        cy.signInAsNormalUser();
      });

      it("gives ability to create dashboard subscriptions", () => {
        visitDashboard(1);
        cy.icon("subscription").click();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Create a dashboard subscription");
      });

      it("gives ability to create question alerts", () => {
        visitQuestion(ORDERS_QUESTION_ID);
        cy.icon("bell").click();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(
          "To send alerts, an admin needs to set up email integration.",
        );
      });
    });
  });

  describe("monitoring permission", () => {
    describe("granted", () => {
      beforeEach(() => {
        cy.visit("/admin/permissions/application");

        modifyPermission("All Users", MONITORING_INDEX, "Yes");

        cy.button("Save changes").click();

        modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        cy.createNativeQuestion(
          {
            name: "broken_question",
            native: { query: "select * from broken_question" },
          },
          { loadMetadata: true },
        );

        cy.signInAsNormalUser();
      });

      // Adding this test to quarantine. When it was failing was making all the subsequents to fail.
      // More details can be found on the Thread https://metaboat.slack.com/archives/CKZEMT1MJ/p1649272824618149
      it.skip("allows accessing tools, audit, and troubleshooting for non-admins", () => {
        cy.visit("/");
        cy.icon("gear").click();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Admin settings").click();

        // Tools smoke test
        cy.url().should("include", "/admin/tools/errors");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Questions that errored when last run");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("broken_question");

        // Audit smoke test
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Audit").click();
        cy.url().should("include", "/admin/audit/members/overview");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("All members").click();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(getFullName(admin));

        // Troubleshooting smoke test
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Troubleshooting").click();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Diagnostic Info");
      });
    });

    describe("revoked", () => {
      it("does not allow accessing tools, audit, and troubleshooting for non-admins", () => {
        cy.signInAsNormalUser();
        cy.visit("/");
        cy.icon("gear").click();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Admin settings").should("not.exist");

        cy.visit("/admin/tools/errors");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Sorry, you don’t have permission to see that.");

        cy.visit("/admin/tools/errors");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Sorry, you don’t have permission to see that.");

        cy.visit("/admin/troubleshooting/help");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Sorry, you don’t have permission to see that.");
      });
    });
  });

  describe("settings permission", () => {
    describe("granted", () => {
      beforeEach(() => {
        cy.visit("/admin/permissions/application");

        modifyPermission("All Users", SETTINGS_INDEX, "Yes");

        cy.button("Save changes").click();

        modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        cy.signInAsNormalUser();
      });

      it("allows editing settings as a non-admin user", () => {
        cy.visit("/");
        cy.icon("gear").click();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Admin settings").click();

        cy.url().should("include", "/admin/settings/general");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("License and Billing").should("not.exist");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Setup").should("not.exist");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Updates").should("not.exist");

        // General smoke test
        cy.get("#setting-site-name").clear().type("new name").blur();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Saved");
      });
    });
  });
});

function createSubscription(user_id) {
  cy.createQuestionAndDashboard({
    questionDetails: {
      name: "Test Question",
      query: {
        "source-table": ORDERS_ID,
      },
    },
  }).then(({ body: { card_id, dashboard_id } }) => {
    cy.createPulse({
      name: "Subscription",
      dashboard_id,
      cards: [
        {
          id: card_id,
          include_csv: false,
          include_xls: false,
        },
      ],
      channels: [
        {
          enabled: true,
          channel_type: "email",
          schedule_type: "hourly",
          recipients: [
            {
              id: user_id,
            },
          ],
        },
      ],
    });
  });
}
