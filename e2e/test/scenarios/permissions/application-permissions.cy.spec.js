const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { adminAppLinkText } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const SETTINGS_INDEX = 0;
const MONITORING_INDEX = 1;
const SUBSCRIPTIONS_INDEX = 2;

const NORMAL_USER_ID = 2;

describe("scenarios > admin > permissions > application", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // H.activateToken("pro-self-hosted");
    H.activateToken("bleeding-edge");
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

        H.modifyPermission("All Users", SUBSCRIPTIONS_INDEX, "No");

        cy.button("Save changes").click();

        H.modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        createSubscription(NORMAL_USER_ID);

        cy.signInAsNormalUser();
      });

      it("revokes ability to create subscriptions and alerts and manage them", () => {
        H.visitDashboard(ORDERS_DASHBOARD_ID);

        H.openSharingMenu();
        H.sharingMenu()
          .findByText(/subscri/i)
          .should("not.exist");

        H.visitQuestion(ORDERS_QUESTION_ID);
        H.tableInteractive().should("be.visible");
        H.sharingMenuButton().should("be.disabled");

        cy.visit("/account/notifications");
        cy.findByTestId("notifications-list").within(() => {
          cy.icon("close").should("not.exist");
        });
      });
    });

    describe("granted", () => {
      it("gives ability to create dashboard subscriptions and question alerts", () => {
        H.setupSMTP();
        cy.signInAsNormalUser();

        cy.log("Set up a dashboard subscription");
        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.openSharingMenu(/subscriptions/i);
        H.sidebar().findByText("Email this dashboard").should("exist");

        cy.log("Create a question alert");
        H.visitQuestion(ORDERS_QUESTION_ID);
        cy.findByLabelText("Move, trash, and more…").click();
        H.popover().findByText("Create an alert").click();
        H.modal().findByText("New alert").should("be.visible");
      });
    });
  });

  describe("monitoring permission", () => {
    describe("granted", () => {
      beforeEach(() => {
        cy.visit("/admin/permissions/application");

        H.modifyPermission("All Users", MONITORING_INDEX, "Yes");

        cy.button("Save changes").click();

        H.modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        H.createNativeQuestion(
          {
            name: "broken_question",
            native: { query: "select * from broken_question" },
          },
          { loadMetadata: true },
        );

        cy.signInAsNormalUser();
      });

      it("allows accessing tools for non-admins", () => {
        cy.visit("/");
        H.goToAdmin();

        cy.log("Tools smoke test");
        cy.location("pathname").should("eq", "/admin/tools/help");
        cy.findByRole("heading", {
          name: "Help",
        });

        cy.findByTestId("admin-layout-sidebar")
          .findByText("Erroring questions")
          .click();
        cy.location("pathname").should("eq", "/admin/tools/errors");
        cy.findByTestId("admin-layout-content").findByText(
          "Questions that errored when last run",
        );
      });
    });

    describe("revoked", () => {
      it("does not allow accessing admin tools for non-admins", () => {
        cy.signInAsNormalUser();
        cy.visit("/");
        H.getModeSwitcher().click();

        H.popover().findByText(adminAppLinkText).should("not.exist");

        cy.visit("/admin/tools/errors");
        H.main().findByText("Sorry, you don’t have permission to see that.");

        cy.visit("/admin/tools/help");
        H.main().findByText("Sorry, you don’t have permission to see that.");
      });
    });
  });

  describe("settings permission", () => {
    describe("granted", () => {
      beforeEach(() => {
        cy.visit("/admin/permissions/application");

        H.modifyPermission("All Users", SETTINGS_INDEX, "Yes");

        cy.button("Save changes").click();

        H.modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        cy.signInAsNormalUser();
      });

      it("allows editing settings as a non-admin user", () => {
        cy.visit("/admin/settings");
        cy.url().should("include", "/admin/settings/general");

        cy.findByTestId("admin-layout-content").within(() => {
          cy.findByText("License and Billing").should("not.exist");
          cy.findByLabelText("Updates").should("not.exist");
          cy.findByLabelText("Site name")
            .should("be.visible")
            .clear()
            .type("NewName")
            .blur();
        });

        H.undoToast()
          .findByText(/changes saved/i)
          .should("be.visible");
      });
    });
  });
});

function createSubscription(user_id) {
  H.createQuestionAndDashboard({
    questionDetails: {
      name: "Test Question",
      query: {
        "source-table": ORDERS_ID,
      },
    },
  }).then(({ body: { card_id, dashboard_id } }) => {
    H.createPulse({
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
