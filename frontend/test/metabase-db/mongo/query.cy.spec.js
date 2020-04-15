import {
  signInAsAdmin,
  restore,
  modal,
  signInAsNormalUser,
} from "__support__/cypress";

function addMongoDatabase() {
  cy.request("POST", "/api/database", {
    engine: "mongo",
    name: "MongoDB",
    details: {
      host: "localhost",
      dbname: "admin",
      port: 27017,
      user: null,
      pass: null,
      authdb: null,
      "additional-options": null,
      "use-srv": false,
      "tunnel-enabled": false,
    },
    auto_run_queries: true,
    is_full_sync: true,
    schedules: {
      cache_field_values: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily",
      },
      metadata_sync: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: null,
        schedule_type: "hourly",
      },
    },
  });
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

  it("can save a native MongoDB query", () => {
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
