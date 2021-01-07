import {
  signInAsNormalUser,
  signInAsAdmin,
  restore,
  popover,
} from "__support__/cypress";

describe("scenarios > visualizations > maps", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should display a pin map for a native query", () => {
    signInAsNormalUser();
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

  it.skip("should suggest map visualization regardless of the first column type (metabase#14254)", () => {
    cy.request("POST", "/api/card", {
      name: "14254",
      dataset_query: {
        type: "native",
        native: {
          query:
            'SELECT "PUBLIC"."PEOPLE"."LONGITUDE" AS "LONGITUDE", "PUBLIC"."PEOPLE"."LATITUDE" AS "LATITUDE", "PUBLIC"."PEOPLE"."CITY" AS "CITY"\nFROM "PUBLIC"."PEOPLE"\nLIMIT 10',
          "template-tags": {},
        },
        database: 1,
      },
      display: "map",
      visualization_settings: {
        "map.region": "us_states",
        "map.type": "pin",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);
    });

    cy.findByText("Visualization")
      .closest(".Button")
      .as("vizButton");
    cy.get("@vizButton").find(".Icon-pinmap");
    cy.get("@vizButton").click();
    cy.findByText("Choose a visualization");
    // Sidebar should really have a distinct class name
    cy.get(".scroll-y .scroll-y").as("vizSidebar");

    cy.get("@vizSidebar").within(() => {
      // There should be a unique class for "selected" viz type
      cy.get(".Icon-pinmap")
        .parent()
        .should("have.class", "text-white");

      cy.findByText("Map")
        .parent()
        .should("have.css", "opacity", "1");
    });
  });
});
