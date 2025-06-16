import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { ORDERS, ORDERS_ID, PRODUCTS, REVIEWS, REVIEWS_ID, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > field > field type", () => {
  const ordersColumns: (keyof typeof ORDERS)[] = ["PRODUCT_ID", "QUANTITY"];

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

  it("should let you change the type to 'Foreign Key' and choose the target field", () => {
    H.visitAlias("@ORDERS_QUANTITY_URL");
    cy.wait("@metadata");

    setFieldType({ oldValue: "Quantity", newValue: "Foreign Key" });
    waitAndAssertOnResponse("fieldUpdate");

    setFKTargetField("Products → ID");
    waitAndAssertOnResponse("fieldUpdate");

    cy.reload();
    cy.wait(["@metadata", "@metadata"]);

    getFieldType();
    cy.findByTestId("fk-target-select").should("have.value", "Products → ID");
  });

  it("should correctly filter out options in Foreign Key picker (metabase#56839)", () => {
    H.visitAlias("@ORDERS_PRODUCT_ID_URL");
    cy.wait(["@metadata", "@metadata"]);

    cy.findByPlaceholderText("Select a target").clear();
    H.popover()
      .should("contain.text", "Orders → ID")
      .and("contain.text", "People → ID")
      .and("contain.text", "Products → ID")
      .and("contain.text", "Reviews → ID");

    cy.log("should case-insensitive match field display name");
    cy.findByPlaceholderText("Select a target").type("id");
    H.popover()
      .should("contain.text", "Orders → ID")
      .and("contain.text", "People → ID")
      .and("contain.text", "Products → ID")
      .and("contain.text", "Reviews → ID");

    cy.log("should case-insensitive match field description");
    cy.findByPlaceholderText("Select a target").clear().type("EXT");
    H.popover()
      .should("not.contain.text", "Orders → ID")
      .and("not.contain.text", "People → ID")
      .and("contain.text", "Products → ID")
      .and("contain.text", "Reviews → ID");
  });

  it("should not let you change the type to 'Number' (metabase#16781)", () => {
    H.visitAlias("@ORDERS_PRODUCT_ID_URL");
    cy.wait(["@metadata", "@metadata"]);

    checkNoFieldType({ oldValue: "Foreign Key", newValue: "Number" });
  });
});
