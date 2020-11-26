import {
  signInAsAdmin,
  restore,
  modal,
  signInAsNormalUser,
  addMySQLDatabase,
} from "__support__/cypress";

const MYSQL_DB_NAME = "QA MySQL8";

describe("mysql > user > query", () => {
  before(() => {
    restore();
    signInAsAdmin();
    addMySQLDatabase(MYSQL_DB_NAME);
  });

  beforeEach(() => {
    signInAsNormalUser();
  });

  it("can query a MySQL database as a user", () => {
    cy.visit("/question/new");
    cy.findByText("Simple question").click();
    cy.findByText(MYSQL_DB_NAME).click();
    cy.findByText("Orders").click();
    cy.contains("37.65");
  });

  it("can write a native MySQL query with a field filter", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.contains(MYSQL_DB_NAME).click();

    // Write Native query that includes a filter
    cy.get(".ace_content").type(
      `SELECT PRODUCT_ID, TOTAL, CATEGORY FROM ORDERS LEFT JOIN PRODUCTS ON ORDERS.PRODUCT_ID = PRODUCTS.ID [[WHERE PRODUCTS.CATEGORY = {{category}}]];`,
      {
        parseSpecialCharSequences: false,
      },
    );
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.get(".Visualization").as("queryPreview");

    cy.get("@queryPreview").contains("Widget");

    // Filter by Doohickey
    cy.findByPlaceholderText("Category")
      .click()
      .type("Doohickey");
    cy.get(".NativeQueryEditor .Icon-play").click();

    cy.get("@queryPreview")
      .contains("Widget")
      .should("not.exist");
    cy.get("@queryPreview").contains("Doohickey");
  });

  it("can save a native MySQL query", () => {
    cy.server();
    cy.route("POST", "/api/card").as("createQuestion");

    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.contains(MYSQL_DB_NAME).click();

    cy.get(".ace_content").type(`SELECT * FROM ORDERS`);
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("37.65");

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
