import { H } from "e2e/support";
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
    createBasicAlert({ firstAlert: true });

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
      cy.request("/api/alert").then(response => {
        expect(response.body).to.have.length(3);
      });
    });

    it("should let you edit an alert", () => {
      cy.intercept("PUT", "/api/alert/*").as("updatedAlert");

      // Change alert
      H.visitQuestion(ORDERS_QUESTION_ID);

      H.openSharingMenu("Edit alerts");

      H.popover().findByText("Edit").click();

      H.modal().findByText("Daily").click();
      H.popover().findByText("Weekly").click();
      H.modal().button("Save changes").click();

      // Check that changes stuck
      cy.wait("@updatedAlert").then(({ response: { body } }) => {
        expect(body.channels[0].schedule_type).to.equal("weekly");
      });
    });
  });

  describe("as a non-admin / normal user", () => {
    beforeEach(cy.signInAsNormalUser);

    it("should not let you see other people's alerts", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openSharingMenu();

      H.sharingMenu().findByText("Edit alerts").should("not.exist");
      H.sharingMenu().findByText("Create alert").should("be.visible");
    });

    it("should let you see other alerts where you are a recipient", () => {
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      H.openSharingMenu("Edit alerts");

      H.popover().findByText(
        `You're receiving ${H.getFullName(admin)}'s alerts`,
      );
      H.popover().findByText("Set up your own alert");
    });

    it("should let you see your own alerts", () => {
      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      H.openSharingMenu("Edit alerts");

      H.popover().findByText("You set up an alert");
    });

    it("should let you unsubscribe from both your own and others' alerts", () => {
      // Unsubscribe from your own alert
      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      H.openSharingMenu("Edit alerts");
      H.popover().findByText("Unsubscribe").click();
      H.notificationList().findByText("Okay, you're unsubscribed.");

      // Unsubscribe from others' alerts
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      H.openSharingMenu("Edit alerts");
      H.popover().findByText("Unsubscribe").click();
      H.notificationList().findByText("Okay, you're unsubscribed.");
    });
  });
});

function createBasicAlert({ firstAlert, includeNormal } = {}) {
  H.openSharingMenu("Create alert");

  if (firstAlert) {
    H.modal().findByText("Set up an alert").click();
  }

  if (includeNormal) {
    cy.findByText("Email alerts to:").parent().children().last().click();
    cy.findByText(H.getFullName(normal)).click();
  }
  cy.findByText("Done").click();
  cy.findByText("Let's set up your alert").should("not.exist");
}
