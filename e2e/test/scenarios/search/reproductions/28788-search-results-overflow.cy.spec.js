import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  isScrollableHorizontally,
  restore,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";

const { PEOPLE_ID } = SAMPLE_DATABASE;
const LONG_STRING = "01234567890ABCDEFGHIJKLMNOPQRSTUVXYZ0123456789";

describe("issue 28788", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/search*").as("search");
  });

  it("search results container should not be scrollable horizontally (metabase#28788)", () => {
    const questionDetails = {
      name: `28788-${LONG_STRING}`,
      type: "model",
      description: LONG_STRING,
      query: {
        "source-table": PEOPLE_ID,
      },
    };

    cy.createCollection({
      name: `Collection-${LONG_STRING}`,
    }).then(({ body: collection }) => {
      cy.createQuestion({
        ...questionDetails,
        collection_id: collection.id,
      });
    });

    visitFullAppEmbeddingUrl({ url: "/", qs: { top_nav: true, search: true } });
    cy.findByPlaceholderText("Search…").type(questionDetails.name);
    cy.wait("@search");
    cy.icon("hourglass").should("not.exist");

    cy.findByTestId("search-bar-results-container").then($container => {
      expect(isScrollableHorizontally($container[0])).to.be.false;
    });
  });
});
