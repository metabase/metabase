import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore } from "e2e/support/helpers";

const { PEOPLE_ID } = SAMPLE_DATABASE;

const LONG_STRING = "01234567890ABCDEFGHIJKLMNOPQRSTUVXYZ0123456789";

const questionDetails = {
  name: `28788-${LONG_STRING}`,
  dataset: true,
  description: LONG_STRING,
  query: {
    "source-table": PEOPLE_ID,
  },
};

describe("issue 28788", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/search*").as("search");
  });

  it("search results container should not be scrollable horizontally (metabase#28788)", () => {
    cy.createCollection({
      name: `Collection-${LONG_STRING}`,
    }).then(({ body: collection }) => {
      cy.createQuestion({
        ...questionDetails,
        collection_id: collection.id,
      });
    });

    cy.visit("/");
    cy.findByPlaceholderText("Search…").type(questionDetails.name);
    cy.wait("@search");
    cy.icon("hourglass").should("not.exist");

    expect(cy.findByTestId("search-bar-results-container")).not.to.be
      .scrollableHorizontally;
  });
});
