import {
  signInAsAdmin,
  restore,
  modal,
  signInAsNormalUser,
} from "__support__/cypress";

function addMySqlDatabase() {
  cy.request("POST", "/api/database", {
    engine: "mysql",
    name: "MySQL",
    details: {
      host: "localhost",
      dbname: "sample",
      port: 3306,
      user: "metabase",
      password: "metasample123",
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

describe("mysql > user > query", () => {
  before(() => {
    restore();
    signInAsAdmin();
    addMySqlDatabase();
  });

  beforeEach(() => {
    signInAsNormalUser();
  });

  it("can query a My SQL database as a user", () => {
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("MySQL").click();
    cy.contains("Orders").click();
    cy.contains("Showing first 2,000 rows");
  });

  it("can write a native MySQL query with a field filter", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.contains("MySQL").click();

    // Write Native query that includes a filter
    cy.get(".ace_content").type(
      `SELECT PRODUCT_ID, TOTAL, CATEGORY FROM ORDERS LEFT JOIN PRODUCTS ON ORDERS.PRODUCT_ID = PRODUCTS.ID [[WHERE PRODUCTS.CATEGORY = {{category}}]];`,
      {
        parseSpecialCharSequences: false,
      },
    );
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("Widget");

    // Filter by Doohickey
    cy.findByPlaceholderText("Category")
      .click()
      .type("Doohickey");
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("Widget").should("not.exist");
    cy.contains("Doohickey");
  });

  it("can save a native My SQL query", () => {
    cy.server();
    cy.route("POST", "/api/card").as("createQuestion");

    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.contains("MySQL").click();

    cy.get(".ace_content").type(`SELECT * FROM ORDERS`, {
      parseSpecialCharSequences: false,
    });
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("2,000");

    // Close the Ace editor because it interferes with the modal for some reason
    cy.get(".Icon-contract").click();

    // Save the query
    cy.contains("Save").click();
    modal()
      .findByLabelText("Name")
      .focus()
      .type("sql count");
    modal()
      .contains("button", "Save")
      .should("not.be.disabled")
      .click();

    cy.wait("@createQuestion").then(({ status }) => {
      expect(status).to.equal(202);
    });

    cy.findByText("Not now").click();

    cy.contains("Save").should("not.exist");
    cy.url().should("match", /\/question\/\d+$/);
  });
});
