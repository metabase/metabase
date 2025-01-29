import { H } from "e2e/support";
import {
  ORDERS_QUESTION_ENTITY_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("scenarios > questions > entity id support", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("/question/entity/${entity_id} should redirect to /question/${id}", () => {
    cy.visit(`/question/entity/${ORDERS_QUESTION_ENTITY_ID}`);
    cy.url().should("contain", `/question/${ORDERS_QUESTION_ID}`);

    // Making sure the question loads
    H.main()
      .findByTestId("saved-question-header-title")
      .should("have.text", "Orders");
  });

  it("/question/entity/${entity_id}/notebook should redirect to /question/${id}/notebook", () => {
    cy.visit(`/question/entity/${ORDERS_QUESTION_ENTITY_ID}/notebook`);
    cy.url().should("contain", `/question/${ORDERS_QUESTION_ID}/notebook`);

    H.queryBuilderHeader().should("contain", "Orders");
  });
});
