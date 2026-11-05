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

  it("should suggest map visualization regardless of the first column type (metabase#14254)", () => {
    H.createNativeQuestion(
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

    // A saved question resets to the default display on load when its display is not sensible
    H.queryBuilderMain().find(".leaflet-marker-icon").should("have.length", 10);
  });

  it("should wrap markers around the international date line correctly (metabase#5369)", () => {
    H.createNativeQuestion(
      {
        name: "friends across time",
        native: {
          query: `
            SELECT 'Kleavor' as name, 68 as lat, -159 as lng
            UNION ALL
            SELECT 'Spectrier' as name, 68 as lat, 159 as lng
            UNION ALL
            SELECT 'Blastoise' as name, 68 as lat, 22 as lng
          `,
          "template-tags": {},
        },
        display: "map",
        visualization_settings: {
          "map.region": "world",
          "map.type": "pin",
          "map.latitude_column": "LAT",
          "map.longitude_column": "LNG",
          "map.center_latitude": 67,
          "map.center_longitude": -175,
          "map.zoom": 1,
        },
      },
      { visitQuestion: true },
    );

    cy.log("zooming should preserve tooltips (metabase#64939)");

    cy.get(".leaflet-marker-icon")
      .then((markers) => {
        // should draw 6 markers
        expect(markers).to.have.length(6);

        return cy.wrap(markers[2]); // Blastoise in Sweden
      })
      .then((marker) => {
        cy.get(marker)
          .realHover()
          .realMouseWheel({ deltaY: -100, scrollBehavior: "nearest" });
      });

    // this waits until we redraw from 6 to 3
    cy.get(".leaflet-marker-icon").should("have.length", 3);

    cy.get(".leaflet-marker-icon").eq(2).as("blastoiseMarker");
    cy.get("@blastoiseMarker").trigger("mousemove");
    H.tooltip().findByText("Blastoise").should("be.visible");
  });

  it("should preserve zoom and pan after resize (metabase#11211)", () => {
    cy.viewport(800, 600);

    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PEOPLE_ID,
          limit: 999,
        },
      },
      display: "map",
      visualization_settings: {
        "map.type": "pin",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
        "map.center_latitude": 40,
        "map.center_longitude": -100,
        "map.zoom": 4,
      },
    });

    zoomIn(4);

    // Compare two settled marker positions instead of racing leaflet's zoom/resize
    // animation with a fixed cy.wait() — mid-animation reads are the flake (metabase#11211).
    getSettledMarkerPosition().then((posAfterZoom) => {
      // 1px resize should not reset zoom
      cy.viewport(801, 600);

      getSettledMarkerPosition().then((posAfterResize) => {
        // Position should be nearly identical (within 5px tolerance)
        const tolerance = 5;
        expect(posAfterResize.left).to.be.closeTo(posAfterZoom.left, tolerance);
        expect(posAfterResize.top).to.be.closeTo(posAfterZoom.top, tolerance);
      });
    });
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

  it("should display a tooltip for a grid map without a metric column (metabase#17940)", () => {
    H.visitQuestionAdhoc({
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

    H.tooltip().within(() => {
      cy.findByText("Latitude: 10°:").should("be.visible");
      cy.findByText("Longitude: 10°:").should("be.visible");
      cy.findByText("1").should("be.visible");
    });
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

  it("should display pins when a breakout column sets a base-type and support the pin type viz setting (metabase#40999) (metabase#59984)", () => {
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

    cy.findByTestId("viz-settings-button").click();

    H.leftSidebar().within(() => {
      cy.findByText("Pin type").should("be.visible");

      cy.findByLabelText("Pin type").click();
      H.popover().findByText("Markers").click();
    });

    cy.findByTestId("visualization-root")
      .find(".leaflet-marker-icon")
      .should("have.length.greaterThan", 10);
  });

  describe(
    "Pin Map brush filters",
    { viewportWidth: 1280, viewportHeight: 800 },
    () => {
      function pinMapSelectRegion(
        x,
        y,
        moveX,
        moveY,
        visualization_settings = {
          "map.center_latitude": 0,
          "map.center_longitude": 0,
          "map.zoom": 0,
          "map.type": "pin",
          "map.latitude_column": "LATITUDE",
          "map.longitude_column": "LONGITUDE",
        },
      ) {
        H.visitQuestionAdhoc({
          dataset_query: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": PEOPLE_ID,
            },
          },
          display: "map",
          visualization_settings,
        });

        cy.get(".CardVisualization").realHover();
        cy.findByTestId("visualization-root")
          .findByText("Draw box to filter")
          .click();

        cy.findByTestId("visualization-root")
          .realMouseDown({ x, y })
          .realMouseMove(moveX, moveY)
          .realMouseUp();

        cy.wait("@dataset");
      }

      it("should apply brush filters by dragging map", () => {
        pinMapSelectRegion(500, 500, 600, 600, {
          "map.region": "us_states",
          "map.type": "pin",
          "map.latitude_column": "LATITUDE",
          "map.longitude_column": "LONGITUDE",
        });
        cy.get(".CardVisualization").should("exist");
        // selecting area at the map provides different filter values, so the simplified assertion is used
        cy.findAllByTestId("filter-pill").should("have.length", 1);
      });

      it("should apply brush filters by dragging map when zoomed out (metabase#41056)", () => {
        pinMapSelectRegion(250, 150, 500, 250);
        cy.get(".CardVisualization").should("exist");
        cy.findAllByTestId("filter-pill").should("have.length", 1);
      });

      it("should handle brush filters that select zero data points (metabase#41056)", () => {
        pinMapSelectRegion(10, 10, 20, 20);
        cy.get(".CardVisualization").should("not.exist");
        cy.findByTestId("question-row-count").findByText("Showing 0 rows");
        cy.findAllByTestId("filter-pill").should("have.length", 1);
      });

      it("should handle brush filters that exceed 360 deg of longitude (metabase#41056)", () => {
        pinMapSelectRegion(10, 10, 1270, 600);
        cy.get(".CardVisualization").should("exist");
        cy.findByTestId("question-row-count").findByText(
          "Showing first 2,000 rows",
        );
        cy.findAllByTestId("filter-pill")
          .should("have.length", 1)
          .contains("Longitude is between -180 and 180");
      });
    },
  );

  describe("issue 18061", () => {
    const questionDetails = {
      name: "18061",
      query: {
        "source-table": PEOPLE_ID,
        expressions: {
          CClat: [
            "case",
            [
              [
                [">", ["field", PEOPLE.ID, null], 1],
                ["field", PEOPLE.LATITUDE, null],
              ],
            ],
          ],
          CClong: [
            "case",
            [
              [
                [">", ["field", PEOPLE.ID, null], 1],
                ["field", PEOPLE.LONGITUDE, null],
              ],
            ],
          ],
        },
        filter: ["<", ["field", PEOPLE.ID, null], 3],
      },
      display: "map",
      visualization_settings: {
        "map.latitude_column": "CClat",
        "map.longitude_column": "CClong",
      },
    };

    const filter = {
      name: "Category",
      slug: "category",
      id: "749a03b5",
      type: "category",
    };

    const dashboardDetails = { name: "18061D", parameters: [filter] };

    function addFilter(filter) {
      H.filterWidget().click();
      H.popover().contains(filter).click();
      cy.button("Add filter").click();
    }

    beforeEach(() => {
      H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashboardCard }) => {
          const { dashboard_id, card_id } = dashboardCard;

          // Enable sharing
          cy.request("POST", `/api/dashboard/${dashboard_id}/public_link`).then(
            ({ body: { uuid } }) => {
              cy.wrap(`/public/dashboard/${uuid}`).as("publicLink");
            },
          );

          cy.wrap(`/question/${card_id}`).as("questionUrl");
          cy.wrap(`/dashboard/${dashboard_id}`).as("dashboardUrl");

          cy.intercept("POST", `/api/card/${card_id}/query`).as("cardQuery");
          cy.intercept(
            "POST",
            `/api/dashboard/${dashboard_id}/dashcard/*/card/${card_id}/query`,
          ).as("dashCardQuery");
          cy.intercept("GET", `/api/card/${card_id}`).as("getCard");

          const mapFilterToCard = {
            parameter_mappings: [
              {
                parameter_id: filter.id,
                card_id,
                target: ["dimension", ["field", PEOPLE.SOURCE, null]],
              },
            ],
          };

          H.editDashboardCard(dashboardCard, mapFilterToCard);
        },
      );
    });

    it("should handle data sets that contain only null values for longitude/latitude (metabase#18061)", () => {
      cy.log("scenario 1: question with a filter (metabase#18061-1)");
      H.visitAlias("@questionUrl");

      cy.wait("@getCard");
      cy.wait("@cardQuery");

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.window().then((w) => (w.beforeReload = true));

      H.queryBuilderHeader().findByTestId("filters-visibility-control").click();
      cy.findByTestId("qb-filters-panel")
        .findByText("ID is less than 3")
        .click();
      H.popover().within(() => {
        cy.findByDisplayValue("3").type("{backspace}2");
        cy.button("Update filter").click();
      });
      cy.wait("@dataset");

      H.assertQueryBuilderRowCount(1);
      H.queryBuilderMain()
        .findByText("Something went wrong")
        .should("not.exist");

      cy.findByTestId("qb-filters-panel")
        .findByText("ID is less than 2")
        .should("be.visible");
      cy.get("[data-element-id=pin-map]").should("be.visible");

      cy.window().should("have.prop", "beforeReload", true);

      cy.log("scenario 2: dashboard with a filter (metabase#18061-2)");
      H.visitAlias("@dashboardUrl");

      cy.wait("@dashCardQuery");
      cy.window().then((w) => (w.beforeReload = true));

      addFilter("Twitter");

      cy.wait("@dashCardQuery");
      cy.location("search").should("eq", "?category=Twitter");

      // The only matching row has null coordinates, so the dashcard shows no results.
      H.getDashboardCard(0).findByTestId("no-results-image").should("exist");
      H.getDashboardCard(0)
        .findByText("Something went wrong")
        .should("not.exist");
      cy.window().should("have.prop", "beforeReload", true);

      cy.log(
        "scenario 3: publicly shared dashboard with a filter (metabase#18061-3)",
      );
      H.visitAlias("@publicLink");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("18061D");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("18061");
      cy.get("[data-element-id=pin-map]");

      addFilter("Twitter");
      cy.location("search").should("eq", "?category=Twitter");
      cy.findAllByTestId("no-results-image");
      cy.get("[data-element-id=pin-map]").should("not.exist");
    });
  });

  describe("issue 18063", () => {
    const questionDetails = {
      name: "18063",
      native: {
        query:
          'select null "LATITUDE", null "LONGITUDE", null "COUNT", \'NULL ROW\' "NAME"\nunion all select 55.6761, 12.5683, 1, \'Copenhagen\'\n',
        "template-tags": {},
      },
      display: "map",
    };

    function selectFieldValue(field, value) {
      toggleFieldSelectElement(field);
      H.popover().findByText(value).click();
    }

    beforeEach(() => {
      H.createNativeQuestion(questionDetails, { visitQuestion: true });

      // Select a Pin map
      H.openVizSettingsSidebar();
      cy.findByTestId("chart-settings-widget-map.type")
        .findByDisplayValue("Region map")
        .click();
      H.popover().contains("Pin map").click();

      // Click on the popovers to close both popovers that open automatically.
      // Please see: https://github.com/metabase/metabase/issues/18063#issuecomment-927836691
      ["Latitude field", "Longitude field"].forEach((field) =>
        H.leftSidebar().within(() => {
          cy.get(`[data-field-title="${field}"]`)
            .findByPlaceholderText("Select a field")
            .should("exist");
          toggleFieldSelectElement(field);
        }),
      );
    });

    it("should show the correct tooltip details for pin map even when some locations are null (metabase#18063)", () => {
      selectFieldValue("Latitude field", "LATITUDE");
      selectFieldValue("Longitude field", "LONGITUDE");

      cy.get(".leaflet-marker-icon").trigger("mousemove");

      H.tooltip().within(() => {
        H.testPairedTooltipValues("LATITUDE", "55.68");
        H.testPairedTooltipValues("LONGITUDE", "12.57");
        H.testPairedTooltipValues("COUNT", "1");
        H.testPairedTooltipValues("NAME", "Copenhagen");
      });
    });
  });

  describe("issues 32075, 30058", () => {
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

    it("should still display visualization as a map after adding another column to group by", () => {
      H.visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

      H.visualize();
      H.openNotebook();
      H.addSummaryGroupingField({ field: "Birth Date" });
      H.visualize();

      H.assertQueryBuilderRowCount(1965);
      H.tableInteractive().should("not.exist");
      cy.get("[data-element-id=pin-map]").should("exist");
    });

    it("should still display visualization as a map after adding another aggregation", () => {
      H.visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

      H.visualize();
      H.openNotebook();
      H.addSummaryField({ metric: "Average of ...", field: "Longitude" });
      H.visualize();

      // The row count does not change, so wait until the query stops running
      H.queryBuilderMain()
        .findByText(/^Doing science/)
        .should("not.exist");
      H.tableInteractive().should("not.exist");
      cy.get("[data-element-id=pin-map]").should("exist");
    });

    it("should change display to default after removing a column to group by when map is not sensible anymore", () => {
      H.visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

      H.visualize();
      H.openNotebook();
      H.removeSummaryGroupingField({ field: "Latitude: Auto binned" });
      H.visualize();

      cy.get("[data-element-id=pin-map]").should("not.exist");
      H.echartsContainer().should("exist");
    });

    it("should not crash visualization after adding a filter (metabase#30058)", () => {
      H.visitQuestionAdhoc({
        dataset_query: testQuery,
        display: "map",
        displayIsLocked: true,
      });

      addCountGreaterThan2Filter();
      H.visualize();

      H.assertQueryBuilderRowCount(21);
      cy.get("[data-element-id=pin-map]").should("exist");
      cy.get(".Icon-warning").should("not.exist");
    });
  });
});

function toggleFieldSelectElement(field) {
  return cy.get(`[data-field-title="${field}"]`).within(() => {
    cy.findByTestId("chart-setting-select").click();
  });
}

function zoomIn(times) {
  for (let i = 0; i < times; i++) {
    cy.get(".leaflet-control-zoom-in").click();
    cy.wait(200);
  }
}

// Resolve the first marker's rect only once its position has held steady for a real
// time window, so we read a settled position instead of racing leaflet's animation
// (metabase#11211). Comparing only two consecutive `.should()` retries is not enough:
// Cypress retries faster than the browser repaints, so two reads can land within the
// same animation frame and return an identical `getBoundingClientRect()` mid-animation
// — a false settle. Anchoring on elapsed time (performance.now) instead of read-count
// guarantees the marker has genuinely stopped moving before we sample it.
const SETTLE_TOLERANCE_PX = 0.5;
const SETTLE_HOLD_MS = 200;

function getSettledMarkerPosition() {
  let anchor = null;
  let anchorAt = 0;
  return cy
    .get(".leaflet-marker-icon")
    .first()
    .should(($marker) => {
      const rect = $marker[0].getBoundingClientRect();
      const now = performance.now();
      const stable =
        anchor != null &&
        Math.abs(rect.left - anchor.left) < SETTLE_TOLERANCE_PX &&
        Math.abs(rect.top - anchor.top) < SETTLE_TOLERANCE_PX;
      if (!stable) {
        // Position moved (or first read) — reset the anchor and restart the timer.
        anchor = rect;
        anchorAt = now;
      }
      expect(
        stable && now - anchorAt >= SETTLE_HOLD_MS,
        "leaflet marker position should be settled",
      ).to.be.true;
    })
    .then(() => anchor);
}
