import { restore, modal } from "__support__/e2e/cypress";

const MYSQL_DB_NAME = "QA MySQL8";

describe("scenatios > question > native > mysql", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("createQuestion");

    restore("mysql-8");
    cy.signInAsAdmin();

    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.contains(MYSQL_DB_NAME).click();
  });

  it("can write a native MySQL query with a field filter", () => {
    // Write Native query that includes a filter
    cy.get(".ace_content").type(
      `SELECT TOTAL, CATEGORY FROM ORDERS LEFT JOIN PRODUCTS ON ORDERS.PRODUCT_ID = PRODUCTS.ID [[WHERE PRODUCTS.ID = {{id}}]];`,
      {
        parseSpecialCharSequences: false,
      },
    );
    cy.get(".NativeQueryEditor .Icon-play").click();

    cy.get(".Visualization").as("queryPreview");

    cy.get("@queryPreview").contains("Widget");

    // Filter by Product ID = 1 (its category is Gizmo)
    cy.findByPlaceholderText(/Id/i).click().type("1");

    cy.get(".NativeQueryEditor .Icon-play").click();

    cy.get("@queryPreview").contains("Widget").should("not.exist");

    cy.get("@queryPreview").contains("Gizmo");
  });

  it("can save a native MySQL query", () => {
    cy.get(".ace_content").type(`SELECT * FROM ORDERS`);
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("37.65");

    // Save the query
    cy.contains("Save").click();

    modal().within(() => {
      cy.findByLabelText("Name").focus().type("sql count");

      cy.button("Save").should("not.be.disabled").click();
    });

    cy.wait("@createQuestion");

    cy.findByText("Not now").click();

    cy.contains("Save").should("not.exist");
    cy.url().should("match", /\/question\/\d+-[a-z0-9-]*$/);
  });
});
