import { restore } from "__support__/e2e/helpers";
import { USER_GROUPS, SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

const { ALL_USERS_GROUP, DATA_GROUP } = USER_GROUPS;

describe("issue 22695 ", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/search?*").as("searchResults");

    restore();
    cy.signInAsAdmin();

    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "block" } },
      },
      [DATA_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "block" } },
      },
    });
  });

  // https://github.com/metabase/metaboat/issues/159
  it("should not expose database names to which the user has no access permissions (metabase#22695)", () => {
    cy.signIn("nocollection");
    cy.visit("/");

    cy.findByPlaceholderText("Search…").click().type("S");
    cy.wait("@searchResults");

    cy.findAllByTestId("search-result-item-name")
      .should("have.length", 1)
      .and("not.contain", "Sample Database");
  });
});
