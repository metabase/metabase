import {
  restore,
  setupLocalHostEmail,
  createBasicAlert,
  popover,
  openPeopleTable,
} from "__support__/e2e/cypress";
// Ported from alert.e2e.spec.js
// *** We should also check that alerts can be set up through slack

const raw_q_id = 1;
const timeseries_q_id = 3;

export function setGoal(number) {
  cy.findByText("Settings").click();
  cy.findByText("Line options");

  cy.findByText("Goal line")
    .next()
    .click();
  cy.get("input[value='0']")
    .clear()
    .type(number);
  cy.findByText("Done").click();
}

describe("scenarios > alert", () => {
  describe("with nothing set", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should prompt you to add email/slack credentials", () => {
      cy.visit("/question/1");
      cy.icon("bell").click();
      cy.findByText(
        "To send alerts, you'll need to set up email or Slack integration.",
      );
    });

    it("should say to non-admins that admin must add email credentials", () => {
      cy.signInAsNormalUser();
      cy.visit("/question/1");
      cy.icon("bell").click();
      cy.findByText(
        "To send alerts, an admin needs to set up email integration.",
      );
    });
  });

  // [quarantine]: cannot run tests that rely on email setup in CI (yet)
  describe.skip("educational screen", () => {
    before(() => {
      // NOTE: Must run `python -m smtpd -n -c DebuggingServer localhost:1025` before these tests
      cy.signInAsAdmin();
      cy.visit("/admin/settings/email");
      setupLocalHostEmail();
      cy.server();
    });

    it("should show for the first alert, but not the second", () => {
      // Create first alert
      cy.visit("/question/1");
      cy.icon("bell").click();

      cy.findByText("The wide world of alerts");
      cy.contains("When a raw data question returns any results");

      cy.findByText("Set up an alert").click();
      cy.findByText("Done").click();

      // Create second alert
      cy.visit("/question/1");
      cy.icon("bell").click();

      cy.findByText("The wide world of alerts").should("not.exist");
    });
  });

  // [quarantine]: cannot run tests that rely on email setup in CI (yet)
  describe.skip("types of alerts", () => {
    before(() => {
      restore();
      cy.signInAsAdmin();
      cy.visit("/admin/settings/email");
      setupLocalHostEmail();
    });

    describe("'rows present' alert", () => {
      it("should be supported for raw data questions ", () => {
        cy.visit(`/question/${raw_q_id}`);
        cy.icon("table");

        createBasicAlert({ firstAlert: true });

        cy.request("/api/alert/").then(response => {
          expect(response.body[0].alert_condition).to.equal("rows");
        });
      });

      it("should be supported for timeseries questions without a goal", () => {
        cy.visit(`/question/${timeseries_q_id}`);
        cy.icon("line");

        createBasicAlert({ firstAlert: true });

        cy.request("api/alert").then(response => {
          expect(response.body[1].alert_condition).to.equal("rows");
        });
      });

      it("should work for timeseries questions with a set goal", () => {
        cy.server();
        cy.route("PUT", "/api/alert/2").as("savedAlert");

        // Set goal on timeseries
        cy.visit(`/question/${timeseries_q_id}`);
        setGoal("7000");

        // Save question
        cy.findByText("Save").click();
        cy.findAllByText("Save")
          .last()
          .click();
        cy.findByText("Save question").should("not.exist");

        // Create alert
        cy.icon("bell").click();
        cy.findByText("Edit").click();
        cy.findByText("Goes above the goal line").click();
        cy.findByText("The first time").click();
        cy.findByText("Save changes").click();

        // Check api call
        cy.wait("@savedAlert");
        cy.request("/api/alert/").then(response => {
          expect(response.body[1].alert_above_goal).to.equal(true);
          expect(response.body[1].alert_first_only).to.equal(true);
        });
      });
    });
  });

  // [quarantine]: cannot run tests that rely on email setup in CI (yet)
  describe.skip("time-multiseries questions with a set goal", () => {
    before(() => {
      restore();
      cy.signInAsAdmin();
      cy.visit("/admin/settings/email");
      setupLocalHostEmail();
    });

    it.skip("should fall back to raw data alert and show a warning", () => {
      // Create a time-multiseries q
      openPeopleTable();
      cy.findByText("Summarize").click();
      cy.icon("notebook").click();
      cy.findByText("Summarize").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();
      popover()
        .within(() => {
          cy.findByPlaceholderText("Find...").type("S");
          cy.findByText("Source").click();
        })
        .then(() => {
          cy.findAllByText("Source")
            .parent()
            .parent()
            .find(".Icon-add")
            .click();
        });
      popover().within(() => {
        cy.findByPlaceholderText("Find...").type("Cr");
        cy.findByText("Created At").click();
      });
      cy.button("Visualize").click();

      // Set a goal
      setGoal("35");
      cy.findByText("Save").click();
      cy.findAllByText("Save")
        .last()
        .click();
      cy.findByText("Not now").click();

      // Create Alert
      cy.icon("bell").click();
      cy.findByText("Set up an alert").click();
      // *** This below warning is not showing when we try to make an alert (Issue #???)
      cy.contains(
        "Goal-based alerts aren't yet supported for charts with more than one line",
      );
      cy.findByText("Goes above the goal line").click();
      cy.findByText("Every time").click();
      cy.findByText("Done").click();
      cy.findByText("Your alert is all set up.")
        .parent()
        .find(".Icon-close")
        .click();

      // Check that alert has changed to raw data/ is not 'goal'
      cy.request("/api/alert").then(response => {
        expect(response.body[0].alert_condition).to.equal("rows");
      });
    });
  });
});
