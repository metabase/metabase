import { signInAsNormalUser, restore, popover } from "__support__/cypress";

describe("scenarios > visualizations > maps", () => {
  before(restore);
  beforeEach(signInAsNormalUser);

  it("should display a pin map for a native query", () => {
    // create a native query with lng/lat fields
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".ace_content").type(
      "select -80 as lng, 40 as lat union all select -120 as lng, 40 as lat",
    );
    cy.get(".NativeQueryEditor .Icon-play").click();

    // switch to a pin map visualization
    cy.contains("Visualization").click();
    cy.get(".Icon-pinmap").click();

    cy.contains("Map type")
      .next()
      .click();
    popover()
      .contains("Pin map")
      .click();

    // When the settings sidebar opens, both latitude and longitude selects are
    // open. That makes it difficult to select each in Cypress, so we click
    // outside twice to close both of them before reopening them one-by-one. :(
    cy.contains("New question").click();
    cy.contains("New question").click();

    // select both columns
    cy.contains("Latitude field")
      .next()
      .click();
    popover()
      .contains("LAT")
      .click();

    cy.contains("Longitude field")
      .next()
      .click();
    popover()
      .contains("LNG")
      .click();

    // check that a map appears
    cy.get(".leaflet-container");
  });
});
