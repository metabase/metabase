import { restore, modal, openNativeEditor } from "e2e/support/helpers";

const MYSQL_DB_NAME = "QA MySQL8";

describe("scenatios > question > native > mysql", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("createQuestion");
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore("mysql-8");
    cy.signInAsAdmin();
  });

  it("can write a native MySQL query with a field filter", () => {
    // Write Native query that includes a filter
    openNativeEditor({ databaseName: MYSQL_DB_NAME }).type(
      `SELECT TOTAL, CATEGORY FROM ORDERS LEFT JOIN PRODUCTS ON ORDERS.PRODUCT_ID = PRODUCTS.ID [[WHERE PRODUCTS.ID = {{id}}]];`,
      {
        parseSpecialCharSequences: false,
      },
    );
    cy.get(".NativeQueryEditor .Icon-play").click();

    cy.wait("@dataset");

    cy.get(".Visualization").as("queryPreview");

    cy.get("@queryPreview").should("be.visible").contains("Widget");

    // Filter by Product ID = 1 (its category is Gizmo)
    cy.findByPlaceholderText(/Id/i).click().type("1");

    cy.get(".NativeQueryEditor .Icon-play").click();

    cy.get("@queryPreview").contains("Widget").should("not.exist");

    cy.get("@queryPreview").contains("Gizmo");
  });

  it("can save a native MySQL query", () => {
    openNativeEditor({ databaseName: MYSQL_DB_NAME }).type(
      `SELECT * FROM ORDERS`,
    );
    cy.get(".NativeQueryEditor .Icon-play").click();

    cy.wait("@dataset");
    cy.findByTextEnsureVisible("SUBTOTAL");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");

    // Save the query
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();

    modal().within(() => {
      cy.findByLabelText("Name").focus().type("sql count");

      cy.button("Save").should("not.be.disabled").click();
    });

    cy.wait("@createQuestion");

    cy.findByTextEnsureVisible("Not now").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").should("not.exist");
    cy.url().should("match", /\/question\/\d+-[a-z0-9-]*$/);
  });
});
