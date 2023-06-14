import { restore } from "e2e/support/helpers";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

describe("issue 20045", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/card${ORDERS_QUESTION_ID}`, {
      name: "Orders Model",
      dataset: true,
    });
  });

  it("should not add query hash on the rerun (metabase#20045)", () => {
    cy.visit(`/model/${ORDERS_QUESTION_ID}`);

    cy.wait("@dataset");

    cy.location("pathname").should(
      "eq",
      `/model/${ORDERS_QUESTION_ID}-orders-model`,
    );
    cy.location("hash").should("eq", "");

    cy.findByTestId("qb-header-action-panel").find(".Icon-refresh").click();

    cy.wait("@dataset");

    cy.location("pathname").should(
      "eq",
      `/model/${ORDERS_QUESTION_ID}-orders-model`,
    );
    cy.location("hash").should("eq", "");
  });
});
