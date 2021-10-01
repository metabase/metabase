import { restore, modal } from "__support__/e2e/cypress";

const MONGO_DB_NAME = "QA Mongo4";

describe("mongodb > user > query", () => {
  before(() => {
    restore("mongo-4");
    cy.signInAsAdmin();
  });

  context("as an admin", () => {
    it("can query a Mongo database", () => {
      queryMongoDB();
    });
  });

  context("as a user", () => {
    beforeEach(() => {
      cy.signInAsNormalUser();
    });

    it("can query a Mongo database", () => {
      queryMongoDB();
    });

    it("can write a native MongoDB query", () => {
      writeNativeMongoQuery();
    });

    it("can save a native MongoDB query", () => {
      cy.server();
      cy.route("POST", "/api/card").as("createQuestion");

      writeNativeMongoQuery();

      cy.findByText("Save").click();
      modal()
        .findByLabelText("Name")
        .focus()
        .type("mongo count");
      modal()
        .contains("button", "Save")
        .should("not.be.disabled")
        .click();

      cy.wait("@createQuestion").then(({ status }) => {
        expect(status).to.equal(202);
      });

      cy.findByText("Not now").click();

      cy.url().should("match", /\/question\/\d+-[a-z0-9-]*$/);
    });
  });
});

function askMongoQuestion({ table_name, mode } = {}) {
  const QUESTION_MODE =
    mode === "notebook" ? "Custom question" : "Simple question";

  cy.visit("/question/new");
  cy.findByText(QUESTION_MODE).click();
  cy.findByText(MONGO_DB_NAME).click();
  cy.findByText(table_name).click();
}

function queryMongoDB() {
  askMongoQuestion({ table_name: "Orders" });
  cy.contains("37.65");
}

function writeNativeMongoQuery() {
  cy.visit("/question/new");
  cy.findByText("Native query").click();
  cy.findByText(MONGO_DB_NAME).click();

  cy.findByText("Select a table").click();
  cy.findByText("Orders").click();

  cy.get(".ace_content").type(`[ { $count: "Total" } ]`, {
    parseSpecialCharSequences: false,
  });
  cy.get(".NativeQueryEditor .Icon-play").click();
  cy.findByText("18,760");
}
