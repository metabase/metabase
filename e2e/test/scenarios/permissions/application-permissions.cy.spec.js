import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  modal,
  describeEE,
  modifyPermission,
  visitQuestion,
  visitDashboard,
  setTokenFeatures,
  setupSMTP,
  sidebar,
  popover,
  undoToast,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const SETTINGS_INDEX = 0;
const MONITORING_INDEX = 1;
const SUBSCRIPTIONS_INDEX = 2;

const NORMAL_USER_ID = 2;

describeEE("scenarios > admin > permissions > application", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("shows permissions help", () => {
    cy.visit("/admin/permissions/application");
    cy.get("main").within(() => {
      cy.findByText("Permissions help").as("permissionHelpButton").click();
      cy.get("@permissionHelpButton").should("not.exist");
    });

    cy.findByLabelText("Permissions help reference").within(() => {
      cy.findAllByText("Applications permissions");

      cy.findByText(
        "Application settings are useful for granting groups access to some, but not all, of Metabase’s administrative features.",
      );
      cy.findByLabelText("Close").click();
    });
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
        visitDashboard(ORDERS_DASHBOARD_ID);
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
      it("gives ability to create dashboard subscriptions", () => {
        setupSMTP();
        cy.signInAsNormalUser();
        visitDashboard(ORDERS_DASHBOARD_ID);
        cy.findByLabelText("subscriptions").click();

        sidebar().findByText("Email this dashboard").should("exist");
      });

      it("gives ability to create question alerts", () => {
        cy.signInAsNormalUser();
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

      it("allows accessing tools and troubleshooting for non-admins", () => {
        cy.visit("/");
        cy.icon("gear").click();

        popover().findByText("Admin settings").click();

        cy.log("Tools smoke test");
        cy.location("pathname").should("eq", "/admin/tools/errors");
        cy.findByRole("heading", {
          name: "Questions that errored when last run",
        });
        cy.findAllByRole("cell").should("contain", "broken_question");

        cy.log("Troubleshooting smoke test");
        cy.findByRole("navigation")
          .findByRole("link", { name: "Troubleshooting" })
          .click();
        cy.location("pathname").should("eq", "/admin/troubleshooting/help");
        cy.get("main")
          .should("contain", "Help")
          .and("contain", "Diagnostic Info");
      });
    });

    describe("revoked", () => {
      it("does not allow accessing tools, and troubleshooting for non-admins", () => {
        cy.signInAsNormalUser();
        cy.visit("/");
        cy.icon("gear").click();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Admin settings").should("not.exist");

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

        undoToast().findByText("Changes saved").should("be.visible");
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
