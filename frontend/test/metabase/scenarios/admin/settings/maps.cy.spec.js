import { restore } from "__support__/e2e/cypress";

describe("scenarios > admin > settings > map settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to load and save a custom map", () => {
    cy.visit("/admin/settings/maps");
    cy.findByText("Add a map").click();
    cy.findByPlaceholderText("e.g. United Kingdom, Brazil, Mars").type(
      "Test Map",
    );
    cy.findByPlaceholderText(
      "Like https://my-mb-server.com/maps/my-map.json",
    ).type(
      "https://raw.githubusercontent.com/metabase/metabase/master/resources/frontend_client/app/assets/geojson/world.json",
    );
    cy.findByText("Load").click();
    cy.wait(2000)
      .findAllByText("Select…")
      .first()
      .click();
    cy.findByText("NAME").click();
    cy.findAllByText("Select…")
      .last()
      .click();
    cy.findAllByText("NAME")
      .last()
      .click();
    cy.findByText("Add map").click();
    cy.wait(3000)
      .findByText("NAME")
      .should("not.exist");
    cy.findByText("Test Map");
  });

  it("should be able to load a custom map even if a name has not been added yet (#14635)", () => {
    cy.intercept("GET", "/api/geojson").as("load");
    cy.visit("/admin/settings/maps");
    cy.findByText("Add a map").click();
    cy.findByPlaceholderText(
      "Like https://my-mb-server.com/maps/my-map.json",
    ).type(
      "https://raw.githubusercontent.com/metabase/metabase/master/resources/frontend_client/app/assets/geojson/world.json",
    );
    cy.findByText("Load").click();
    cy.wait("@load").then(interception => {
      expect(interception.response.statusCode).to.eq(200);
    });
  });

  it("should show an informative error when adding an invalid URL", () => {
    cy.visit("/admin/settings/maps");
    cy.findByText("Add a map").click();
    cy.findByPlaceholderText(
      "Like https://my-mb-server.com/maps/my-map.json",
    ).type("bad-url");
    cy.findByText("Load").click();
    cy.findByText(
      "Invalid GeoJSON file location: must either start with http:// or https:// or be a relative path to a file on the classpath. " +
        "URLs referring to hosts that supply internal hosting metadata are prohibited.",
    );
  });
});
