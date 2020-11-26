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
      cy.visit("/question/new");
      cy.contains("Native query").click();
      cy.contains(MONGO_DB_NAME).click();

      cy.get(".ace_content").type(`[ { $count: "Total" } ]`, {
        parseSpecialCharSequences: false,
      });
      cy.get(".NativeQueryEditor .Icon-play").click();
      cy.contains("1");
    });

    it("can save a native MongoDB query", () => {
      cy.server();
      cy.route("POST", "/api/card").as("createQuestion");

      cy.visit("/question/new");
      cy.contains("Native query").click();
      cy.contains(MONGO_DB_NAME).click();

      cy.get(".ace_content").type(`[ { $count: "Total" } ]`, {
        parseSpecialCharSequences: false,
      });
      cy.get(".NativeQueryEditor .Icon-play").click();
      cy.contains("1");

      // Close the Ace editor because it interferes with the modal for some reason
      cy.get(".Icon-contract").click();

      cy.contains("Save").click();
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
  cy.contains("Simple question").click();
  cy.contains(MONGO_DB_NAME).click();
  cy.contains("Orders").click();
  cy.contains("37.65");
}
