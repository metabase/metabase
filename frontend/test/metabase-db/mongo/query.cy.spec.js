import {
  signInAsAdmin,
  restore,
  modal,
  signInAsNormalUser,
  typeAndBlurUsingLabel,
} from "__support__/cypress";

function addMongoDatabase() {
  cy.visit("/admin/databases/create");
  cy.contains("Database type")
    .closest(".Form-field")
    .find("a")
    .click();
  cy.contains("MongoDB").click({ force: true });
  cy.contains("Additional Mongo connection");

  typeAndBlurUsingLabel("Name", "QA Mongo4");
  typeAndBlurUsingLabel("Host", "localhost");
  cy.findByPlaceholderText("27017")
    .click()
    .type("27017");
  typeAndBlurUsingLabel("Database name", "sample");
  typeAndBlurUsingLabel("Username", "metabase");
  typeAndBlurUsingLabel("Password", "metasample123");
  typeAndBlurUsingLabel("Authentication Database", "admin");

  cy.findByText("Save")
    .should("not.be.disabled")
    .click();
}

describe("mongodb > user > query", () => {
  before(() => {
    cy.server();
    cy.route({
      method: "POST",
      url: "/api/database",
    }).as("createDatabase");

    restore();
    signInAsAdmin();
    addMongoDatabase();
    cy.wait("@createDatabase");
  });

  beforeEach(() => {
    signInAsNormalUser();
  });

  it("can query a Mongo database as a user", () => {
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("QA Mongo4").click();
    cy.contains("Orders").click();
    cy.contains("37.65");
  });

  it("can write a native MongoDB query", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.contains("QA Mongo4").click();

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
    cy.contains("QA Mongo4").click();

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
