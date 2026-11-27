const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { PEOPLE_ID } = SAMPLE_DATABASE;
const { normal, admin } = USERS;

describe("scenarios > alert", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
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
    });

    it("should be able to create and delete alerts with webhooks enabled", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);

      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Create an alert").click();

      H.addNotificationHandlerChannel("Bar Hook");

      H.selectScheduleTime();
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

      cy.log("the deleted alert is gone after a reload");
      cy.reload();
      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Create an alert").should("be.visible");
      H.popover().findByText("Edit alerts").should("not.exist");
    });
  });

  describe("approved domains (EE)", { tags: "@external" }, () => {
    const allowedDomain = "metabase.test";
    const deniedDomain = "metabase.example";
    const deniedEmail = `mailer@${deniedDomain}`;
    // We're not exposing allowed domains to normal users.
    const normalUserAlertError = `Failed save alert. The following email addresses are not allowed: ${deniedEmail}`;
    const normalUserSubscriptionError = `Cannot create subscription. The following email addresses are not allowed: ${deniedEmail} Please contact your administrator.`;
    const adminAlertError = `You're only allowed to email alerts to addresses ending in ${allowedDomain}`;
    const adminSubscriptionError = `You're only allowed to email subscriptions to addresses ending in ${allowedDomain}`;

    function addEmailRecipient(email: string) {
      cy.findByTestId("token-field")
        .findByRole("combobox")
        .click()
        .type(`${email}`)
        .blur();
    }

    function setAllowedDomains() {
      H.updateSetting("subscription-allowed-domains", allowedDomain);
    }

    beforeEach(() => {
      H.activateToken("pro-self-hosted");
      H.setupSMTP();
      setAllowedDomains();
    });

    it("should validate approved email domains for a question alert and a dashboard subscription (metabase#17977)", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);

      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Create an alert").click();

      H.selectScheduleTime();
      H.modal().within(() => {
        cy.findByText("New alert").should("be.visible");

        addEmailRecipient(deniedEmail);

        cy.findByText(adminAlertError);
        cy.button("Done").should("be.disabled");
      });

      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.toggleDashboardSubscriptionsSidebar();

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
      H.selectScheduleTime();
      H.modal().within(() => {
        cy.findByText("New alert").should("be.visible");

        addEmailRecipient(deniedEmail);

        cy.button("Done").click();
      });
      cy.findByTestId("toast-undo").within(() => {
        cy.root().should("have.text", normalUserAlertError);
      });

      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.toggleDashboardSubscriptionsSidebar();

      H.sidebar().within(() => {
        addEmailRecipient(deniedEmail);

        cy.button("Done").click();
      });
      cy.findByTestId("toast-undo").within(() => {
        cy.root().should("have.text", normalUserSubscriptionError);
      });
    });
  });
});

describe("scenarios > alert > email_alert", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/notification").as("saveAlert");
    cy.intercept("POST", "/api/card").as("saveCard");

    H.restore();
    cy.signInAsAdmin();

    H.setupSMTP();
  });

  it("should set up an email alert for a new question and update it without updating the question (metabase#36866)", () => {
    cy.intercept("PUT", "/api/notification/*").as("updatedAlert");
    cy.intercept("PUT", "/api/card/*").as("updateCard");

    H.openTable({
      table: PEOPLE_ID,
    });

    saveQuestionAndCreateAlert();

    cy.log("Check that /api/card has been called once");
    cy.get("@saveCard.all").should("have.length", 1);

    cy.findByTestId("toast-undo")
      .findByText("Your alert is all set up.")
      .should("be.visible");

    cy.wait("@saveAlert").then(({ response }) => {
      expect(response?.body.handlers[0].channel_type).to.eq("channel/email");
    });

    cy.findByLabelText("Move, duplicate, and more…").click();
    H.popover().findByText("Edit alerts").click();

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
    H.selectScheduleTime();
    cy.button("Save changes").click();

    cy.wait("@updatedAlert").then(({ response }) => {
      expect(response?.body.subscriptions[0].cron_schedule).to.equal(
        "0 0 8 ? * 2 *",
      );
    });

    cy.log("Check that /api/card has still only been called once");
    cy.get("@saveCard.all").should("have.length", 1);
    cy.get("@updateCard.all").should("have.length", 0);
  });

  describe("branding", () => {
    const questionName = "Fourty Two";

    it("should include branding for OSS instances", { tags: "@OSS" }, () => {
      sendTestAlertForQuestion(questionName);
      cy.findAllByRole("link")
        .filter(":contains(Made with)")
        .should("contain", "Metabase")
        .and(
          "have.attr",
          "href",
          "https://www.metabase.com?utm_source=product&utm_medium=export&utm_campaign=exports_branding&utm_content=alert",
        );
    });

    it("should include branding for Starter instances and not claim a schedule for a one-off alert", () => {
      H.activateToken("starter");
      createQuestionAndOpenAlert(questionName);
      H.sendAlertAndVisitIt();
      cy.findAllByRole("link")
        .filter(`:contains(${questionName})`)
        .should("be.visible");

      cy.get("table.header")
        .first()
        .within(() => {
          cy.findByText(questionName).should("be.visible");
          cy.findByText(/Run daily at/).should("not.exist");
        });

      cy.findAllByRole("link")
        .filter(":contains(Made with)")
        .should("contain", "Metabase")
        .and(
          "have.attr",
          "href",
          "https://www.metabase.com?utm_source=product&utm_medium=export&utm_campaign=exports_branding&utm_content=alert",
        );
    });

    it("should not include branding on Pro/Enterprise instances", () => {
      H.activateToken("pro-self-hosted");
      sendTestAlertForQuestion(questionName);
      cy.findAllByRole("link")
        .filter(":contains(Made with)")
        .should("not.exist");
    });
  });
});

describe("scenarios > alert > alert permissions", { tags: "@external" }, () => {
  // Intentional use of before (not beforeEach) hook because the setup is quite long.
  // Make sure that all tests are always able to run independently!
  before(() => {
    H.restore();
    cy.signInAsAdmin();

    H.setupSMTP();

    // Create alert as admin
    H.visitQuestion(ORDERS_QUESTION_ID);
    createBasicAlert();

    // Create alert as admin that user can see
    H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
    createBasicAlert({ includeNormal: true });

    // Create alert as normal user
    cy.signInAsNormalUser();
    H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
    createBasicAlert();
  });

  describe("as an admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should let you see all created alerts", () => {
      cy.request<{ payload_type: string }[]>("/api/notification").then(
        (response) => {
          const questionAlerts = response.body.filter(
            (notification) => notification.payload_type === "notification/card",
          );
          expect(questionAlerts).to.have.length(3);
        },
      );
    });
  });

  describe("as a non-admin / normal user", () => {
    beforeEach(() => {
      cy.signInAsNormalUser();
    });

    it("should not let you see other people's alerts", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);
      cy.findByLabelText("Move, trash, and more…").click();

      H.popover().findByText("Create an alert").should("be.visible");
      H.popover().findByText("Edit alerts").should("not.exist");
    });

    it("should let you see and unsubscribe from others' alerts where you are a recipient", () => {
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Edit alerts").click();

      H.modal().within(() => {
        cy.button("New alert").should("be.visible");
        cy.findByText(`Created by ${H.getFullName(admin)}`, {
          exact: false,
        })
          .should("be.visible")
          .realHover();
        cy.icon("unsubscribe").click();
      });

      H.modal().within(() => {
        cy.findByText("Confirm you want to unsubscribe");
        cy.button("Unsubscribe").click();
      });

      H.notificationList().findByText("Successfully unsubscribed.");
    });

    it("should let you edit your own alerts", () => {
      cy.intercept("PUT", "/api/notification/*").as("updatedAlert");

      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Edit alerts").click();

      H.modal()
        .findByText(/Created by you/)
        .click();

      H.modal().within(() => {
        cy.findByText("Edit alert").should("be.visible");
        cy.button("Done").should("be.enabled");

        cy.findByTestId("select-frequency").click();
      });
      H.popover().findByText("weekly").click();
      H.selectScheduleTime();

      H.modal().button("Save changes").click();

      // Check that changes stuck
      cy.wait("@updatedAlert").then(({ response }) => {
        expect(response?.body.subscriptions[0].cron_schedule).to.equal(
          "0 0 8 ? * 2 *",
        );
      });

      H.modal().findByText("Check on Monday at 8:00 AM");
    });
  });
});

function saveQuestionAndCreateAlert() {
  H.openSharingMenu();

  H.modal().within(() => {
    cy.findByLabelText("Name").type(" alert");
    cy.button("Save").click();
  });
  cy.wait("@saveCard");

  cy.findByLabelText("Move, duplicate, and more…").click();
  H.popover().findByText("Create an alert").click();
  H.selectScheduleTime();
  H.modal().button("Done").click();
}

function createQuestionAndOpenAlert(name: string) {
  H.createNativeQuestion(
    {
      name,
      native: { query: "select 42" },
    },
    { visitQuestion: true },
  );

  cy.findByLabelText("Move, trash, and more…").click();
  H.popover().findByText("Create an alert").click();
}

function sendTestAlertForQuestion(name: string) {
  createQuestionAndOpenAlert(name);
  H.selectScheduleTime();
  H.sendAlertAndVisitIt();
  cy.findAllByRole("link").filter(`:contains(${name})`).should("be.visible");
}

function createBasicAlert({ includeNormal = false } = {}) {
  cy.findByLabelText("Move, trash, and more…").click();
  H.popover().findByText("Create an alert").click();

  if (includeNormal) {
    cy.findByTestId("alert-configured-channel")
      .findByText("Email")
      .closest('[data-testid="channel-block"]')
      .findByTestId("token-field")
      .findByRole("combobox")
      .type(`${H.getFullName(normal)}{enter}`);
  }

  H.selectScheduleTime();
  cy.findByText("Done").click();
  cy.findByText("New alert").should("not.exist");
}
