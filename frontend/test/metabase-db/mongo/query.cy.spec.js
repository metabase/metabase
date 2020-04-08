import {
  signInAsAdmin,
  restore,
  modal,
  signInAsNormalUser,
} from "__support__/cypress";

function typeField(label, value) {
  cy.findByLabelText(label)
    .clear()
    .type(value)
    .blur();
}

function addMongoDatabase() {
  cy.visit("/admin/databases/create");
  cy.contains("Database type")
    .closest(".Form-field")
    .find("a")
    .click();
  cy.contains("MongoDB").click({ force: true });
  cy.contains("Additional Mongo connection");

  typeField("Name", "MongoDB");
  typeField("Database name", "admin");

  cy.findByText("Save")
    .should("not.be.disabled")
    .click();
}

describe("mongodb > user > query", () => {
  before(() => {
    restore();
    signInAsAdmin();
    addMongoDatabase();
  });

  beforeEach(() => {
    signInAsNormalUser();
  });

  it("can query a Mongo database as a user", () => {
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("MongoDB").click();
    cy.contains("Version").click();
    cy.contains("featureCompatibilityVersion");
  });

  it.only("can write a native MongoDB query", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.contains("MongoDB").click();

    cy.get(".ace_content").type(`[ { $count: "Total" } ]`, {
      parseSpecialCharSequences: false,
    });
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("1");
  });

  it.only("can save a native MongoDB query", () => {
    cy.server();
    cy.route("POST", "/api/card").as("createQuestion");

    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.contains("MongoDB").click();

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

    modal()
      .contains("Not now")
      .click();

    cy.url().should("match", /\/question\/\d+$/);
  });
});
