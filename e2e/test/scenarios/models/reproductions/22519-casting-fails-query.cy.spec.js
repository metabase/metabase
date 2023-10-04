import { restore } from "e2e/support/helpers";
import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import { turnIntoModel } from "../helpers/e2e-models-helpers";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const ratingDataModelUrl = `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${REVIEWS_ID}/field/${REVIEWS.RATING}/general`;

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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Don't cast").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("UNIX seconds → Datetime").click();
    cy.wait("@updateField");
  });

  it("model query should not fail when data model is using casting (metabase#22519)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("xavier");

    turnIntoModel();

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("xavier");
  });
});
