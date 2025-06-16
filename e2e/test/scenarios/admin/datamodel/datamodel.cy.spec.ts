import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { ORDERS, ORDERS_ID, PRODUCTS, REVIEWS, REVIEWS_ID, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > field > field type", () => {
  const ordersColumns = ["PRODUCT_ID", "QUANTITY"];

  function waitAndAssertOnResponse(alias: string) {
    cy.wait("@" + alias).then((request) => {
      expect(request.response?.body.errors).to.not.exist;
    });
  }

  function getFieldType() {
    return cy.findByPlaceholderText("Select a semantic type");
  }

  function setFieldType({
    oldValue,
    newValue,
  }: {
    oldValue: string;
    newValue: string;
  }) {
    getFieldType().should("have.value", oldValue).click();

    H.popover().within(() => {
      cy.findByText(newValue).click();
    });
  }

  function checkNoFieldType({
    oldValue,
    newValue,
  }: {
    oldValue: string;
    newValue: string;
  }) {
    getFieldType().should("have.value", oldValue).click();

    H.popover().within(() => {
      cy.findByText(newValue).should("not.exist");
    });
  }

  function setFKTargetField(field: string) {
    cy.findByPlaceholderText("Select a target").click();

    H.popover().contains(field).click();
  }

  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");

    H.restore();
    cy.signInAsAdmin();

    ordersColumns.forEach((column) => {
      cy.wrap(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS[column]}/general`,
      ).as(`ORDERS_${column}_URL`);
    });

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
  });

  it("should let you change the type to 'No semantic type'", () => {
    H.visitAlias("@ORDERS_PRODUCT_ID_URL");
    cy.wait(["@metadata", "@metadata"]);

    setFieldType({ oldValue: "Foreign Key", newValue: "No semantic type" });

    waitAndAssertOnResponse("fieldUpdate");

    cy.reload();
    cy.wait("@metadata");

    getFieldType().should("have.value", "No semantic type");
  });
});
