import { restore } from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { REVIEWS_ID } = SAMPLE_DATABASE;

const reviewsDataModelPage = `/admin/datamodel/database/${SAMPLE_DB_ID}/table/${REVIEWS_ID}`;

describe("issue 21984", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata?**").as("tableMetadata");

    restore();
    cy.signInAsAdmin();

    cy.visit(reviewsDataModelPage);
    cy.wait(["@tableMetadata", "@tableMetadata"]);

    cy.findByDisplayValue("ID");
  });

  it('should not show data model visited tables in search or in "Pick up where you left off" items on homepage (metabase#21984)', () => {
    cy.visit("/");

    cy.findByText("Metabase tips");
    cy.findByText("Pick up where you left off").should("not.exist");

    cy.findByPlaceholderText("Search…").click();
    cy.findByText("Recently viewed");
    cy.findByText("Nothing here");
  });
});
