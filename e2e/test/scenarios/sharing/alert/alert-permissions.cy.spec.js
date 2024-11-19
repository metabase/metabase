import { USERS } from "e2e/support/cypress_data";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  getFullName,
  modal,
  notificationList,
  openSharingMenu,
  popover,
  restore,
  setupSMTP,
  sharingMenu,
  visitQuestion,
} from "e2e/support/helpers";

const { normal, admin } = USERS;

describe("scenarios > alert > alert permissions", { tags: "@external" }, () => {
  // Intentional use of before (not beforeEach) hook because the setup is quite long.
  // Make sure that all tests are always able to run independently!
  before(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    // Create alert as admin
    visitQuestion(ORDERS_QUESTION_ID);
    createBasicAlert({ firstAlert: true });

    // Create alert as admin that user can see
    visitQuestion(ORDERS_COUNT_QUESTION_ID);
    createBasicAlert({ includeNormal: true });

    // Create alert as normal user
    cy.signInAsNormalUser();
    visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
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
      visitQuestion(ORDERS_QUESTION_ID);

      openSharingMenu("Edit alerts");

      popover().findByText("Edit").click();

      modal().findByText("Daily").click();
      popover().findByText("Weekly").click();
      modal().button("Save changes").click();

      // Check that changes stuck
      cy.wait("@updatedAlert").then(({ response: { body } }) => {
        expect(body.channels[0].schedule_type).to.equal("weekly");
      });
    });
  });

  describe("as a non-admin / normal user", () => {
    beforeEach(cy.signInAsNormalUser);

    it("should not let you see other people's alerts", () => {
      visitQuestion(ORDERS_QUESTION_ID);
      openSharingMenu();

      sharingMenu().findByText("Edit alerts").should("not.exist");
      sharingMenu().findByText("Create alert").should("be.visible");
    });

    it("should let you see other alerts where you are a recipient", () => {
      visitQuestion(ORDERS_COUNT_QUESTION_ID);
      openSharingMenu("Edit alerts");

      popover().findByText(`You're receiving ${getFullName(admin)}'s alerts`);
      popover().findByText("Set up your own alert");
    });

    it("should let you see your own alerts", () => {
      visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      openSharingMenu("Edit alerts");

      popover().findByText("You set up an alert");
    });

    it("should let you unsubscribe from both your own and others' alerts", () => {
      // Unsubscribe from your own alert
      visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      openSharingMenu("Edit alerts");
      popover().findByText("Unsubscribe").click();
      notificationList().findByText("Okay, you're unsubscribed.");

      // Unsubscribe from others' alerts
      visitQuestion(ORDERS_COUNT_QUESTION_ID);
      openSharingMenu("Edit alerts");
      popover().findByText("Unsubscribe").click();
      notificationList().findByText("Okay, you're unsubscribed.");
    });
  });
});

function createBasicAlert({ firstAlert, includeNormal } = {}) {
  openSharingMenu("Create alert");

  if (firstAlert) {
    modal().findByText("Set up an alert").click();
  }

  if (includeNormal) {
    cy.findByText("Email alerts to:").parent().children().last().click();
    cy.findByText(getFullName(normal)).click();
  }
  cy.findByText("Done").click();
  cy.findByText("Let's set up your alert").should("not.exist");
}
