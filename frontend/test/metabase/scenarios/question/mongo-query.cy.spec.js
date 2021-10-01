import { restore } from "__support__/e2e/cypress";

const MONGO_DB_NAME = "QA Mongo4";

describe("scenarios > question > query > mongo", () => {
  before(() => {
    restore("mongo-4");
    cy.signInAsAdmin();
  });

  it("can query Mongo database", () => {
    cy.visit("/question/new");
    cy.findByText("Simple question").click();
    cy.findByText(MONGO_DB_NAME).click();
    cy.findByText("Orders").click();

    cy.contains("37.65");
  });
});
