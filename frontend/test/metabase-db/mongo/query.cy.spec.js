import {
  signInAsAdmin,
  restore,
  modal,
  signInAsNormalUser,
  addMongoDatabase,
} from "__support__/cypress";

const MONGO_DB_NAME = "QA Mongo4";

describe("mongodb > user > query", () => {
  before(() => {
    restore();
    signInAsAdmin();
    addMongoDatabase(MONGO_DB_NAME);
  });

  context("as an admin", () => {
    it("can query a Mongo database", () => {
      queryMongoDB();
    });
  });

  context("as a user", () => {
    beforeEach(() => {
      signInAsNormalUser();
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

      cy.url().should("match", /\/question\/\d+$/);
    });
  });
});

function queryMongoDB() {
  cy.visit("/question/new");
  cy.findByText("Simple question").click();
  cy.findByText(MONGO_DB_NAME).click();
  cy.findByText("Orders").click();
  cy.contains("37.65");
}

function writeNativeMongoQuery() {
  cy.visit("/question/new");
  cy.findByText("Native query").click();
  cy.findByText(MONGO_DB_NAME).click();

  cy.get(".ace_content").type(`[ { $count: "Total" } ]`, {
    parseSpecialCharSequences: false,
  });
  cy.get(".NativeQueryEditor .Icon-play").click();
  cy.findByText("18,760");
}
