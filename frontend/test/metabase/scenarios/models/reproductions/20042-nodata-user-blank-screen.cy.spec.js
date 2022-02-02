import { restore } from "__support__/e2e/cypress";

describe.skip("issue 20042", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/card/1", { name: "Orders Model", dataset: true });

    cy.signIn("nodata");
  });

  it("nodata user should not see the blank screen when visiting model (metabase#20042)", () => {
    cy.visit("/model/1");

    cy.wait("@dataset");

    cy.findByText("Orders Model");
    cy.contains("37.65");
  });
});
