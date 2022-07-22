import { restore } from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

import { turnIntoModel } from "../helpers/e2e-models-helpers";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const ratingDataModelUrl = `/admin/datamodel/database/${SAMPLE_DB_ID}/table/${REVIEWS_ID}/${REVIEWS.RATING}/general`;

const questionDetails = {
  query: {
    "source-table": REVIEWS_ID,
  },
};

describe.skip("issue 22519", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.visit(ratingDataModelUrl);

    cy.findByText("Don't cast").click();
    cy.findByText("UNIX seconds → Datetime").click();
    cy.wait("@updateField");
  });

  it("model query should not fail when data model is using casting (metabase#22519)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    cy.findByText("xavier");

    turnIntoModel();

    cy.wait("@dataset");
    cy.findByText("xavier");
  });
});
