import { restore } from "e2e/support/helpers";

describe("issue 20045", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/card/1", { name: "Orders Model", dataset: true });
  });

  it("should not add query hash on the rerun (metabase#20045)", () => {
    cy.visit("/model/1");

    cy.wait("@dataset");

    cy.location("pathname").should("eq", "/model/1-orders-model");
    cy.location("hash").should("eq", "");

    cy.findByTestId("qb-header-action-panel").find(".Icon-refresh").click();

    cy.wait("@dataset");

    cy.location("pathname").should("eq", "/model/1-orders-model");
    cy.location("hash").should("eq", "");
  });
});
