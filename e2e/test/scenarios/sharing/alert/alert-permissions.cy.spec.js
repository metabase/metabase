const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { normal, admin } = USERS;

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
    beforeEach(cy.signInAsAdmin);

    it("should let you see all created alerts", () => {
      cy.request("/api/notification").then((response) => {
        const questionAlerts = response.body.filter(
          (notification) => notification.payload_type === "notification/card",
        );
        expect(questionAlerts).to.have.length(3);
      });
    });

    it("should let you edit an alert", () => {
      cy.intercept("PUT", "/api/notification/*").as("updatedAlert");

      // Change alert
      H.visitQuestion(ORDERS_QUESTION_ID);

      H.openSharingMenu("Edit alerts");

      H.modal()
        .findByText(/Created by you/)
        .click();

      H.modal().findByTestId("select-frequency").click();
      H.popover().findByText("weekly").click();
      H.modal().button("Save changes").click();

      // Check that changes stuck
      cy.wait("@updatedAlert").then(({ response: { body } }) => {
        expect(body.subscriptions[0].cron_schedule).to.equal("0 0 8 ? * 2 *");
      });
    });
  });

  describe("as a non-admin / normal user", () => {
    beforeEach(cy.signInAsNormalUser);

    it("should not let you see other people's alerts", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openSharingMenu();

      H.sharingMenu().findByText("Edit alerts").should("not.exist");
      H.sharingMenu().findByText("Create an alert").should("be.visible");
    });

    it("should let you see other alerts where you are a recipient", () => {
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      H.openSharingMenu("Edit alerts");

      H.modal().within(() => {
        cy.findByText(`Created by ${H.getFullName(admin)}`, {
          exact: false,
        }).should("be.visible");
        cy.button("New alert").should("be.visible");
      });
    });

    it("should let you see your own alerts", () => {
      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      H.openSharingMenu("Edit alerts");

      H.modal().findByText(/Created by you/);
    });

    it("should let you unsubscribe from others' alerts", () => {
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      H.openSharingMenu("Edit alerts");
      H.modal().within(() => {
        cy.findByText(`Created by ${H.getFullName(admin)}`, {
          exact: false,
        }).realHover();
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
      H.openSharingMenu("Edit alerts");
      H.modal()
        .findByText(/Created by you/)
        .click();

      H.modal().within(() => {
        cy.findByText("Edit alert").should("be.visible");
        cy.button("Done").should("be.enabled");

        cy.findByTestId("select-frequency").click();
      });
      H.popover().findByText("weekly").click();

      H.modal().button("Save changes").click();

      // Check that changes stuck
      cy.wait("@updatedAlert").then(({ response: { body } }) => {
        expect(body.subscriptions[0].cron_schedule).to.equal("0 0 8 ? * 2 *");
      });

      H.modal().findByText("Check on Monday at 8:00 AM");
    });
  });
});

function createBasicAlert({ includeNormal } = {}) {
  H.openSharingMenu("Create an alert");

  if (includeNormal) {
    cy.findByText("Email")
      .closest('[data-testid="channel-block"]')
      .findByTestId("token-field")
      .click();
    cy.findByText(H.getFullName(normal)).click();
  }

  cy.findByText("Done").click();
  cy.findByText("New alert").should("not.exist");
}
