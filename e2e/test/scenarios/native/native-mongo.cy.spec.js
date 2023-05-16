import { restore, modal } from "e2e/support/helpers";

const MONGO_DB_NAME = "QA Mongo4";

describe("scenarios > question > native > mongo", { tags: "@external" }, () => {
  before(() => {
    cy.intercept("POST", "/api/card").as("createQuestion");
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore("mongo-4");
    cy.signInAsNormalUser();

    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    // Reproduces metabase#20499 issue
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Native query").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(MONGO_DB_NAME).click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a table").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
  });

  it("can save a native MongoDB query", () => {
    cy.get(".ace_content")
      .should("be.visible")
      .type(`[ { $count: "Total" } ]`, {
        parseSpecialCharSequences: false,
      });
    cy.get(".NativeQueryEditor .Icon-play").click();

    cy.wait("@dataset");

    cy.findByTextEnsureVisible("18,760");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.findByTextEnsureVisible("Save new question");

    modal().within(() => {
      cy.findByLabelText("Name").clear().should("be.empty").type("mongo count");

      cy.button("Save").should("not.be.disabled").click();
    });

    cy.wait("@createQuestion");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not now").click();

    cy.url().should("match", /\/question\/\d+-[a-z0-9-]*$/);
  });
});
