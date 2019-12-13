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
    cy.visit("/question/1");

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
