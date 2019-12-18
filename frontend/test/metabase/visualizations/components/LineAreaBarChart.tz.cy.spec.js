import path from "path";
import { signInAsAdmin } from "__support__/cypress";

const expectedValuesByReportingTZ = {
  "US/Pacific": [24, 23],
  "Asia/Hong_Kong": [16, 24],
};

const clientTZ = Cypress.env("CLIENT_TZ");
const serverTZ = Cypress.env("SERVER_TZ");

describe("LineAreaBarChart", () => {
  beforeEach(signInAsAdmin);

  it(`should display correctly with server tz ${serverTZ} and client tz ${clientTZ}`, () => {
    addTimestampDatabase();
    setupQuestion();

    // Check bar count and x-axis labels
    cy.get(".bar").should("have.length", 2);
    cy.contains("March 9, 2019");
    cy.contains("March 10, 2019");

    const tooltipContains = t => cy.get(".PopoverContainer").contains(t);

    const [firstValue, secondValue] = expectedValuesByReportingTZ[serverTZ];

    // hover on first bar and check tooltip label
    cy.get(".bar")
      .first()
      .trigger("mousemove");
    tooltipContains("March 9, 2019");
    tooltipContains(firstValue);

    // hover on second bar and check tooltip label
    cy.get(".bar")
      .last()
      .trigger("mousemove");
    tooltipContains("March 10, 2019");
    tooltipContains(secondValue);
  });
});

function addTimestampDatabase() {
  cy.visit("/admin/databases/create");
  cy.get("select").select("H2");

  cy.get('input[name="name"]').type("Timezone Data");
  const dbPath = path.resolve(
    Cypress.config("fileServerFolder"),
    "frontend/test/__runner__/timezone-data.db",
  );
  cy.get("input[name='db']").type(`file:${dbPath}`);
  cy.contains("Save").click();
  cy.contains("Explore this data");
}

function setupQuestion() {
  cy.visit("/question/new");
  cy.contains("Simple question").click();
  cy.contains("Timezone Data").click();
  cy.contains("Times Tamps").click();
  cy.contains("March 9, 2019");
  cy.contains("Summarize").click();
  cy.contains("Group by")
    .parent()
    .find(".Icon-calendar")
    .click();
  cy.contains("Filter").click();
  cy.contains("Filter by")
    .parent()
    .next()
    .find(".Icon-calendar")
    .click();

  cy.contains("Previous")
    .parent()
    .click();
  cy.contains("Before").click();

  cy.get(`input[type="text"]`).type("{selectAll}03/11/2019");
  cy.contains("Add filter").click();

  cy.contains("Visualization").click();
  cy.get(".Icon-bar").click();
  // wait for the chart to finish resizing, so we don't grab the bars as
  // they're being added/removed
  cy.wait(2000);
}
