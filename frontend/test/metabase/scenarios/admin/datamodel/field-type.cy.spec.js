import { restore, visitAlias, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

const ordersColumns = ["PRODUCT_ID", "QUANTITY"];

describe("scenarios > admin > datamodel > field > field type", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    ordersColumns.forEach(column => {
      cy.wrap(
        `/admin/datamodel/database/1/table/${ORDERS_ID}/${ORDERS[column]}/general`,
      ).as(`ORDERS_${column}_URL`);
    });

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
  });

  it("should let you change the type to 'No semantic type'", () => {
    visitAlias("@ORDERS_PRODUCT_ID_URL");

    setFieldType({ oldValue: "Foreign Key", newValue: "No semantic type" });

    waitAndAssertOnResponse("fieldUpdate");

    cy.reload();

    getFieldType("No semantic type");
  });

  it("should let you change the type to 'Foreign Key' and choose the target field", () => {
    visitAlias("@ORDERS_QUANTITY_URL");

    setFieldType({ oldValue: "Quantity", newValue: "Foreign Key" });

    waitAndAssertOnResponse("fieldUpdate");

    setFKTargetField("Products → ID");

    waitAndAssertOnResponse("fieldUpdate");

    cy.reload();

    getFieldType("Foreign Key");
    getFKTargetField("Products → ID");
  });

  it.skip("should let you change the type to 'Number' (metabase#16781)", () => {
    visitAlias("@ORDERS_PRODUCT_ID_URL");

    setFieldType({ oldValue: "Foreign Key", newValue: "Number" });

    waitAndAssertOnResponse("fieldUpdate");

    cy.reload();

    getFieldType("Number");
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
    .find(".AdminSelect-content")
    .contains(type);
}

function setFieldType({ oldValue, newValue } = {}) {
  getFieldType(oldValue).click();
  popover().within(() => {
    cy.get(".ReactVirtualized__Grid").scrollTo(0, 0); // HACK: scroll to the top of the list. Ideally we should probably disable AccordionList virtualization
    cy.findByPlaceholderText("Find...").type(newValue);
    cy.get(".List-item")
      .contains(newValue)
      .click();
  });
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

  popover()
    .contains(field)
    .click();
}
