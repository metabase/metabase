import { restore, visitAlias, popover } from "e2e/support/helpers";
import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const ordersColumns = ["PRODUCT_ID", "QUANTITY"];

describe("scenarios > admin > datamodel > field > field type", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");

    restore();
    cy.signInAsAdmin();

    ordersColumns.forEach(column => {
      cy.wrap(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS[column]}/general`,
      ).as(`ORDERS_${column}_URL`);
    });

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
  });

  it("should let you change the type to 'No semantic type'", () => {
    visitAlias("@ORDERS_PRODUCT_ID_URL");
    cy.wait(["@metadata", "@metadata"]);

    setFieldType({ oldValue: "Foreign Key", newValue: "No semantic type" });

    waitAndAssertOnResponse("fieldUpdate");

    cy.reload();
    cy.wait("@metadata");

    getFieldType("No semantic type");
  });

  it("should let you change the type to 'Foreign Key' and choose the target field", () => {
    visitAlias("@ORDERS_QUANTITY_URL");
    cy.wait("@metadata");

    setFieldType({ oldValue: "Quantity", newValue: "Foreign Key" });

    waitAndAssertOnResponse("fieldUpdate");

    setFKTargetField("Products → ID");

    waitAndAssertOnResponse("fieldUpdate");

    cy.reload();
    cy.wait(["@metadata", "@metadata"]);

    getFieldType("Foreign Key");
    getFKTargetField("Products → ID");
  });

  it("should not let you change the type to 'Number' (metabase#16781)", () => {
    visitAlias("@ORDERS_PRODUCT_ID_URL");
    cy.wait(["@metadata", "@metadata"]);

    checkNoFieldType({ oldValue: "Foreign Key", newValue: "Number" });
  });
});

function waitAndAssertOnResponse(alias) {
  cy.wait("@" + alias).then(xhr => {
    expect(xhr.response.body.errors).to.not.exist;
  });
}

function getFieldType(type) {
  return cy
    .findByText("Field Type")
    .closest("section")
    .find("[data-testid='select-button-content']")
    .contains(type);
}

function setFieldType({ oldValue, newValue } = {}) {
  getFieldType(oldValue).click();

  popover().within(() => {
    cy.findByText(oldValue).closest(".ReactVirtualized__Grid").scrollTo(0, 0); // HACK: scroll to the top of the list. Ideally we should probably disable AccordionList virtualization
    searchFieldType(newValue);
    cy.findByText(newValue).click();
  });
}

function checkNoFieldType({ oldValue, newValue } = {}) {
  getFieldType(oldValue).click();

  popover().within(() => {
    searchFieldType(newValue);
    cy.findByText(newValue).should("not.exist");
  });
}

function searchFieldType(type) {
  cy.findByPlaceholderText("Find...").type(type);
}

function getFKTargetField(targetField) {
  return cy
    .get(".TableEditor-field-target")
    .as("targetField")
    .invoke("text")
    .should("eq", targetField);
}

function setFKTargetField(field) {
  cy.findByText("Select a target").click();

  popover().contains(field).click();
}
