import {
  restore,
  popover,
  visitQuestionAdhoc,
  openNativeEditor,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

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
    cy.findByTestId("native-query-editor-container").icon("play").click();

    // switch to a pin map visualization
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    cy.icon("pinmap").click();
    cy.findByTestId("Map-button").within(() => {
      cy.icon("gear").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Map type").next().click();
    popover().contains("Pin map").click();

    // When the settings sidebar opens, both latitude and longitude selects are
    // open. That makes it difficult to select each in Cypress, so we click
    // outside twice to close both of them before reopening them one-by-one. :(
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("New question").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("New question").click();

    // select both columns
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Latitude field").next().click();
    popover().contains("LAT").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Longitude field").next().click();
    popover().contains("LNG").click();

    // check that a map appears
    cy.get(".leaflet-container");
  });

  it("should suggest map visualization regardless of the first column type (metabase#14254)", () => {
    cy.createNativeQuestion(
      {
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
      },
      { visitQuestion: true },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").closest(".Button").as("vizButton");
    cy.get("@vizButton").click();
    cy.findByTestId("display-options-sensible").as("sensibleOptions");

    cy.get("@sensibleOptions").within(() => {
      cy.findByText("Map").should("be.visible");
    });
  });

  it(
    "should not assign the full name of the state as the filter value on a drill-through (metabase#14650)",
    { tags: "@flaky" },
    () => {
      cy.intercept("/app/assets/geojson/**").as("geojson");
      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
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

      cy.wait("@geojson");

      cy.get(".CardVisualization svg path")
        .should("be.visible")
        .eq(22)
        .as("texas");

      // hover to see the tooltip
      cy.get("@texas").trigger("mousemove");

      // check tooltip content
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("State:"); // column name key
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Texas"); // feature name as value

      // open drill-through menu and drill within it
      cy.get("@texas").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/See these People/i).click();

      cy.log("Reported as a regression since v0.37.0");
      cy.wait("@dataset").then(xhr => {
        expect(xhr.request.body.query.filter).not.to.contain("Texas");
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("State is TX");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("171 Olive Oyle Lane"); // Address in the first row
    },
  );

  it("should display a tooltip for a grid map without a metric column (metabase#17940)", () => {
    visitQuestionAdhoc({
      display: "map",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PEOPLE_ID,
          breakout: [
            [
              "field",
              PEOPLE.LONGITUDE,
              {
                binning: {
                  strategy: "default",
                },
              },
            ],
            [
              "field",
              PEOPLE.LATITUDE,
              {
                binning: {
                  strategy: "default",
                },
              },
            ],
          ],
          limit: 1,
        },
      },
      visualization_settings: {
        "map.type": "grid",
        "table.pivot_column": "LATITUDE",
        "table.cell_column": "LONGITUDE",
      },
    });

    cy.get(".leaflet-interactive").trigger("mousemove");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Latitude:");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Longitude:");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1");
  });

  it("should render grid map visualization for native questions (metabase#8362)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: `
              select 20 as "Latitude", -110 as "Longitude", 1 as "metric" union all
              select 70 as "Latitude", -170 as "Longitude", 5 as "metric"
            `,
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "map",
      visualization_settings: {
        "map.type": "grid",
        "map.latitude_column": "Latitude",
        "map.longitude_column": "Longitude",
        "map.metric_column": "metric",
      },
    });

    // Ensure chart is rendered
    cy.get(".leaflet-interactive");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();

    // Ensure the Map visualization is sensible
    cy.findByTestId("Map-button").should(
      "have.attr",
      "data-is-sensible",
      "true",
    );
  });
});
