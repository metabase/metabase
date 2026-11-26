const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > maps", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should display a pin map for a native query", () => {
    cy.signInAsNormalUser();
    // create a native query with lng/lat fields
    H.startNewNativeQuestion();
    H.NativeEditor.type(
      "select -80 as lng, 40 as lat union all select -120 as lng, 40 as lat",
    );
    cy.findByTestId("native-query-editor-container").icon("play").click();

    // switch to a pin map visualization
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    H.leftSidebar().within(() => {
      cy.findByTestId("more-charts-toggle").click();
      cy.icon("pinmap").click();
    });
    cy.findByTestId("Map-container").within(() => {
      cy.icon("gear").click();
    });

    toggleFieldSelectElement("Map type");
    H.popover().findByText("Pin map").click();

    // When the settings sidebar opens, both latitude and longitude selects are
    // open. That makes it difficult to select each in Cypress, so we click
    // inside both of them before reopening them one-by-one. :(
    // Please see: https://github.com/metabase/metabase/issues/18063#issuecomment-927836691
    ["Latitude field", "Longitude field"].map((field) =>
      H.leftSidebar().within(() => {
        toggleFieldSelectElement(field);
      }),
    );

    // select both columns
    H.leftSidebar().within(() => {
      toggleFieldSelectElement("Latitude field");
    });
    H.popover().findByText("LAT").click();

    H.leftSidebar().within(() => {
      toggleFieldSelectElement("Longitude field");
    });
    H.popover().findByText("LNG").click();

    // check that a map appears
    cy.get(".leaflet-container");
  });

  it("should not assign the full name of the state as the filter value on a drill-through (metabase#14650)", () => {
    cy.intercept("/app/assets/geojson/**").as("geojson");
    H.visitQuestionAdhoc({
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

    cy.get(".CardVisualization svg path").eq(22).as("texas");

    cy.get("@texas").should("be.visible");

    // hover to see the tooltip
    cy.get("@texas").trigger("mousemove");

    // check tooltip content
    H.tooltip().within(() => {
      cy.findByText("State:").should("be.visible"); // column name key
      cy.findByText("Texas").should("be.visible"); // feature name as value
    });

    // open drill-through menu and drill within it
    cy.get("@texas").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/See these People/i).click();

    cy.log("Reported as a regression since v0.37.0");
    cy.wait("@dataset");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("State is TX");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("171 Olive Oyle Lane"); // Address in the first row
  });

  it("should render grid map visualization for native questions (metabase#8362)", () => {
    H.visitQuestionAdhoc({
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

    // An ad-hoc question resets to the default display when its display is not sensible
    H.queryBuilderMain().find(".leaflet-interactive").should("exist");
  });

  it("should load pin tiles when a breakout column sets a base-type (metabase#40999) (metabase#59984)", () => {
    cy.intercept("/api/tiles/**").as("tiles");

    H.visitQuestionAdhoc({
      display: "map",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PEOPLE_ID,
          aggregation: ["count"],
          breakout: [
            [
              "field",
              PEOPLE.LONGITUDE,
              {
                "base-type": "type/Float",
              },
            ],
            [
              "field",
              PEOPLE.LATITUDE,
              {
                "base-type": "type/Float",
              },
            ],
          ],
        },
      },
      visualization_settings: {
        "map.type": "pin",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
      },
    });

    // this should not create a 400 error (metabase#59984)
    cy.wait("@tiles").its("response.statusCode").should("eq", 200);
  });

  it(
    "should apply brush filters by dragging map",
    { viewportWidth: 1280, viewportHeight: 800 },
    () => {
      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PEOPLE_ID,
          },
        },
        display: "map",
        visualization_settings: {
          "map.region": "us_states",
          "map.type": "pin",
          "map.latitude_column": "LATITUDE",
          "map.longitude_column": "LONGITUDE",
        },
      });

      cy.get(".CardVisualization").realHover();
      cy.findByTestId("visualization-root")
        .findByText("Draw box to filter")
        .click();

      cy.findByTestId("visualization-root")
        .realMouseDown({ x: 500, y: 500 })
        .realMouseMove(600, 600)
        .realMouseUp();

      cy.wait("@dataset");
      cy.get(".CardVisualization").should("exist");
      // selecting area at the map provides different filter values, so the simplified assertion is used
      cy.findAllByTestId("filter-pill").should("have.length", 1);
    },
  );

  describe("issue 32075", () => {
    const testQuery = {
      type: "query",
      query: {
        "source-query": {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              PEOPLE.LATITUDE,
              { "base-type": "type/Float", binning: { strategy: "default" } },
            ],
            [
              "field",
              PEOPLE.LONGITUDE,
              { "base-type": "type/Float", binning: { strategy: "default" } },
            ],
          ],
        },
      },
      database: SAMPLE_DB_ID,
    };

    const addCountGreaterThan2Filter = () => {
      H.openNotebook();
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByTestId("action-buttons").last().button("Filter").click();
      H.popover().findByText("Count").click();
      H.selectFilterOperator("Greater than");
      H.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("2");
        cy.button("Add filter").click();
      });
    };

    beforeEach(() => {
      cy.signInAsNormalUser();
    });

    it("should still display visualization as a map after adding a filter (metabase#32075)", () => {
      H.visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

      H.visualize();
      addCountGreaterThan2Filter();
      H.visualize();

      H.assertQueryBuilderRowCount(21);
      H.tableInteractive().should("not.exist");
      cy.get("[data-element-id=pin-map]").should("exist");
    });
  });
});

function toggleFieldSelectElement(field: string) {
  return cy.get(`[data-field-title="${field}"]`).within(() => {
    cy.findByTestId("chart-setting-select").click();
  });
}
