const { H } = cy;

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

  it("should not make requests to `/api/card/12` when the entity id starts with `12`", () => {
    const entityId = "12".padEnd(21, "x");

    // this is a request that could be made by mistake if some paths of the code think that the entity id is a slug of a question
    cy.intercept("GET", "/api/card/12").as("wrongCardRequest");

    cy.intercept("POST", "/api/util/entity_id").as("entityIdRequest");

    cy.visit(`/question/entity/${entityId}`);

    // await the entity id request to make sure the "wrong" request had its time to get fired
    cy.wait("@entityIdRequest");

    // it should render a 404 page as that entity id doesn't exist
    H.main().findByText("We're a little lost...").should("be.visible");

    cy.get("@wrongCardRequest.all").should("have.length", 0);
  });
});
