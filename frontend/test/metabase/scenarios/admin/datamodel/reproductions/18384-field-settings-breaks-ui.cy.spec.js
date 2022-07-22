import { restore } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE_ID, PEOPLE, REVIEWS_ID } = SAMPLE_DATABASE;

describe("issue 18384", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Hide Reviews table
    cy.request("PUT", "/api/table", {
      ids: [REVIEWS_ID],
      visibility_type: "hidden",
    });
  });

  it("should be able to open field properties even when one of the tables is hidden (metabase#18384)", () => {
    cy.visit(`/admin/datamodel/database/1/table/${PEOPLE_ID}`);

    cy.findByDisplayValue("Address").parent().find(".Icon-gear").click();

    cy.location("pathname").should(
      "eq",
      `/admin/datamodel/database/1/table/${PEOPLE_ID}/${PEOPLE.ADDRESS}/general`,
    );

    cy.findByText(/Address – Field Settings/i);
  });
});
