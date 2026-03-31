import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > datamodel redirects", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should redirect /admin/datamodel to /data-studio/data", () => {
    cy.visit("/admin/datamodel");
    cy.location("pathname").should("eq", "/data-studio/data");
  });

  it("should redirect /admin/datamodel/database/... to /data-studio/data", () => {
    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
    );
    cy.location("pathname").should("eq", "/data-studio/data");
  });

  it("should redirect /admin/datamodel/segments to /data-studio/data", () => {
    cy.visit("/admin/datamodel/segments");
    cy.location("pathname").should("eq", "/data-studio/data");
  });
});
