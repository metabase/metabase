import moment from "moment";
import { restore } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";

describe("scenarios > collection items metadata", () => {
  beforeEach(() => {
    restore();
  });

  describe("last edit date", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    const IN_15_MIN = moment().add(15, "minutes");
    const IN_HOUR = moment().add(1, "hours");
    const IN_4_HOURS = moment().add(4, "hours");
    const TOMORROW = moment().add(1, "days");
    const IN_THREE_DAYS = moment().add(3, "days");
    const NEXT_WEEK = moment().add(1, "week");
    const NEXT_MONTH = moment().add(1, "month");
    const IN_4_MONTHS = moment().add(4, "month");
    const NEXT_YEAR = moment().add(1, "year");

    const testCases = [
      { date: IN_15_MIN, expected: /Edited 15 minutes ago/i },
      { date: IN_HOUR, expected: /Edited an hour ago/i },
      { date: IN_4_HOURS, expected: /Edited 4 hours ago/i },
      { date: TOMORROW, expected: /Edited a day ago/i },
      { date: IN_THREE_DAYS, expected: /Edited 3 days ago/i },
      { date: NEXT_WEEK, expected: /Edited 7 days ago/i },
      { date: NEXT_MONTH, expected: /Edited a month ago/i },
      { date: IN_4_MONTHS, expected: /Edited 4 months ago/i },
      { date: NEXT_YEAR, expected: /Edited a year ago/i },
    ];

    it("should display last edit moment for dashboards", () => {
      cy.visit("/dashboard/1");
      changeDashboard();
      cy.findByText(/Edited a few seconds ago/i);

      cy.intercept("GET", "/api/dashboard/1").as("getDashboard");
      testCases.forEach(testCase => {
        const { date, expected } = testCase;
        cy.clock(date.valueOf());
        cy.reload();
        cy.wait("@getDashboard");
        cy.findByText(expected);
        cy.clock().invoke("restore");
      });
    });

    it("should display last edit moment for questions", () => {
      cy.visit("/question/1");
      changeQuestion();
      cy.findByText(/Edited a few seconds ago/i);

      cy.intercept("GET", "/api/card/1").as("getQuestion");
      testCases.forEach(testCase => {
        const { date, expected } = testCase;
        cy.clock(date.valueOf());
        cy.reload();
        cy.wait("@getQuestion");
        cy.findByText(expected);
        cy.clock().invoke("restore");
      });
    });
  });

  describe("last editor", () => {
    it("should display if user is the last editor", () => {
      cy.signInAsAdmin();
      cy.visit("/dashboard/1");
      cy.findByText(/Edited .* by you/i);
      cy.visit("/question/1");
      cy.findByText(/Edited .* by you/i);
    });

    it("should display last editor's name", () => {
      const { first_name, last_name } = USERS.admin;
      // Example: John Doe —> John D.
      const expectedName = `${first_name} ${last_name.charAt(0)}.`;

      cy.signIn("normal");
      cy.visit("/dashboard/1");
      cy.findByText(new RegExp(`Edited .* by ${expectedName}`, "i"));
      cy.visit("/question/1");
      cy.findByText(new RegExp(`Edited .* by ${expectedName}`, "i"));
    });

    it("should change last editor when another user changes item", () => {
      const { first_name, last_name } = USERS.normal;
      const fullName = `${first_name} ${last_name}`;

      cy.signIn("normal");
      cy.visit("/collection/root");
      // Ensure nothing is edited by current user,
      // Otherwise, the test is irrelevant
      cy.findByText(fullName).should("not.exist");

      cy.findByText("Orders").click();
      changeQuestion();

      cy.visit("/collection/root");
      cy.findByText("Orders in a dashboard").click();
      changeDashboard();

      cy.visit("/collection/root");
      getTableRowFor("Orders").findByText(fullName);
      getTableRowFor("Orders in a dashboard").findByText(fullName);
    });
  });
});

function changeDashboard() {
  cy.intercept("PUT", "/api/dashboard/**").as("updateDashboard");
  cy.icon("ellipsis").click();
  cy.findByText("Change title and description").click();
  cy.findByLabelText("Description")
    .click()
    .type("This dashboard is just beautiful");
  cy.button("Update").click();
  cy.wait("@updateDashboard");
}

function changeQuestion() {
  cy.intercept("PUT", "/api/card/**").as("updateQuestion");
  cy.icon("pencil").click();
  cy.findByText("Edit this question").click();
  cy.findByLabelText("Description")
    .click()
    .type("Very insightful");
  cy.button("Save").click();
  cy.wait("@updateQuestion");
}

function getTableRowFor(name) {
  return cy.findByText(name).closest("tr");
}
