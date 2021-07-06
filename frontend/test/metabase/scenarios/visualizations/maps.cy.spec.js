import {
  restore,
  popover,
  visitQuestionAdhoc,
  openNativeEditor,
} from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATASET;

describe("scenarios > visualizations > maps", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display a pin map for a native query", () => {
    cy.signInAsNormalUser();
    // create a native query with lng/lat fields
    openNativeEditor().type(
      "select -80 as lng, 40 as lat union all select -120 as lng, 40 as lat",
    );
    cy.get(".NativeQueryEditor .Icon-play").click();

    // switch to a pin map visualization
    cy.contains("Visualization").click();
    cy.icon("pinmap").click();

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

  it("should suggest map visualization regardless of the first column type (metabase#14254)", () => {
    cy.createNativeQuestion({
      name: "14254",
      native: {
        query:
          'SELECT "PUBLIC"."PEOPLE"."LONGITUDE" AS "LONGITUDE", "PUBLIC"."PEOPLE"."LATITUDE" AS "LATITUDE", "PUBLIC"."PEOPLE"."CITY" AS "CITY"\nFROM "PUBLIC"."PEOPLE"\nLIMIT 10',
        "template-tags": {},
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
      cy.icon("pinmap")
        .parent()
        .should("have.class", "text-white");

      cy.findByText("Map")
        .parent()
        .should("have.css", "opacity", "1");
    });
  });

  it("should not assign the full name of the state as the filter value on a drill-through (metabase#14650)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: 1,
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [["field", PEOPLE.STATE, null]],
        },
        type: "query",
      },
      display: "map",
      visualization_settings: {
        "map.type": "region",
        "map.region": "us_states",
      },
    });

    cy.get(".CardVisualization svg path")
      .eq(22)
      .as("texas");

    // hover to see the tooltip
    cy.get("@texas").trigger("mousemove");

    // check tooltip content
    cy.findByText("State:"); // column name key
    cy.findByText("Texas"); // feature name as value

    cy.server();
    cy.route("POST", `/api/dataset`).as("dataset");
    // open actions menu and drill within it
    cy.get("@texas").click();
    cy.findByText(/View these People/i).click();

    cy.log("Reported as a regression since v0.37.0");
    cy.wait("@dataset").then(xhr => {
      expect(xhr.request.body.query.filter).not.to.contain("Texas");
    });
    cy.findByText("State is TX");
    cy.findByText("171 Olive Oyle Lane"); // Address in the first row
  });
});
