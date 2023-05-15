import { restore, visitQuestionAdhoc } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

describe("visual tests > visualizations > map", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  const customGeoJsonUrl =
    "https://raw.githubusercontent.com/metabase/metabase/master/resources/frontend_client/app/assets/geojson/world.json";
  const testMapName = "My Test Map";

  const saveCustomMap = () => {
    cy.request("PUT", "/api/setting/custom-geojson", {
      value: {
        "my-test-map-id": {
          name: testMapName,
          url: customGeoJsonUrl,
          region_key: "NAME",
          region_name: "NAME",
        },
      },
    });
  };

  it("properly displays custom maps in settings", () => {
    cy.visit("/admin/settings/maps");

    cy.findByTestId("custom-geojson-setting").within(() => {
      cy.findByText("Add a map").click();
    });

    cy.findByTestId("edit-map-modal").within(() => {
      cy.findByPlaceholderText(/e.g. United Kingdom/i).type(testMapName);
      cy.findByPlaceholderText(/my-map.json/i).type(customGeoJsonUrl);
      cy.findByText("Load").click();
    });

    cy.findByTestId("loading-spinner").should("not.exist");
    cy.findByLabelText("hourglass icon").should("not.exist");
    cy.get(".leaflet-container").should("be.visible");

    cy.createPercySnapshot();
  });

  it("properly displays custom map in query builder", () => {
    saveCustomMap();

    const testQuery = {
      type: "native",
      native: {
        query:
          "SELECT 'Brazil' region, 23 val UNION " +
          "SELECT 'Algeria' region, 42 val;",
      },
      database: SAMPLE_DB_ID,
    };

    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "map",
      visualization_settings: {
        "map.region": "my-test-map-id",
      },
    });

    cy.findByTestId("loading-spinner").should("not.exist");
    cy.findByLabelText("hourglass icon").should("not.exist");
    cy.get(".leaflet-container").should("be.visible");

    cy.createPercySnapshot();
  });
});
