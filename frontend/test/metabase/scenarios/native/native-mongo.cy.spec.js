import { restore, modal } from "__support__/e2e/cypress";

const MONGO_DB_NAME = "QA Mongo4";

describe("scenarios > question > native > mongo", () => {
  before(() => {
    cy.intercept("POST", "/api/card").as("createQuestion");

    restore("mongo-4");
    cy.signInAsNormalUser();

    cy.visit("/");
    cy.findByText("New").click();
    // Reproduces metabase#20499 issue
    cy.findByText("Native query").click();
    cy.findByText(MONGO_DB_NAME).click();

    cy.findByText("Select a table").click();
    cy.findByText("Orders").click();
  });

  it("can save a native MongoDB query", () => {
    cy.get(".ace_content")
      .first()
      .type(`[ { $count: "Total" } ]`, {
        parseSpecialCharSequences: false,
      });
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.findByText("18,760");

    cy.findByText("Save").click();

    modal().within(() => {
      cy.findByLabelText("Name")
        .focus()
        .type("mongo count");

      cy.button("Save")
        .should("not.be.disabled")
        .click();
    });

    cy.wait("@createQuestion");

    cy.findByText("Not now").click();

    cy.url().should("match", /\/question\/\d+-[a-z0-9-]*$/);
  });
});
