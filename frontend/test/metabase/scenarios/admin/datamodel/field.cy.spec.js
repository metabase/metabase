import { signInAsAdmin, restore } from "__support__/cypress";

const ORDERS_CREATED_AT_URL = "/admin/datamodel/database/1/table/2/15/general";
const ORDERS_PRODUCT_URL = "/admin/datamodel/database/1/table/2/11/general";
const ORDERS_QUANTITY_URL = "/admin/datamodel/database/1/table/2/14/general";

describe("admin > datamodel > field", () => {
  beforeEach(() => {
    signInAsAdmin();
    cy.server();
    cy.route("PUT", "/api/field/*").as("fieldUpdate");
    cy.route("POST", "/api/field/*/dimension").as("fieldDimensionUpdate");
    cy.route("POST", "/api/field/*/values").as("fieldValuesUpdate");
  });

  describe("Name and Description", () => {
    before(restore);

    it("lets you change field name and description", () => {
      cy.visit(ORDERS_CREATED_AT_URL);

      cy.get('input[name="display_name"]').as("display_name");
      cy.get('input[name="description"]').as("description");

      // update the name
      cy.get("@display_name")
        .should("have.value", "Created At")
        .clear()
        .type("new display_name")
        .blur();
      cy.wait("@fieldUpdate");

      // update the description
      cy.get("@description")
        .should("have.value", "The date and time an order was submitted.")
        .clear()
        .type("new description")
        .blur();
      cy.wait("@fieldUpdate");

      // reload and verify they have been updated
      cy.reload();
      cy.get("@display_name").should("have.value", "new display_name");
      cy.get("@description").should("have.value", "new description");
    });
  });

  describe("Visibility", () => {
    before(restore);

    it("lets you change field visibility", () => {
      cy.visit(ORDERS_CREATED_AT_URL);

      cy.contains("Everywhere").click();
      cy.contains("Do not include").click({ force: true });
      cy.wait("@fieldUpdate");

      cy.reload();
      cy.contains("Do not include");
    });
  });

  describe("Field Type", () => {
    before(restore);

    it("lets you change the type to 'No special type'", () => {
      cy.visit(ORDERS_PRODUCT_URL);

      cy.contains("Foreign Key").click();
      cy.contains("No special type").click({ force: true });
      cy.wait("@fieldUpdate");

      cy.reload();
      cy.contains("No special type");
    });

    it("lets you change the type to 'Number'", () => {
      cy.visit(ORDERS_PRODUCT_URL);

      cy.contains("No special type").click();
      cy.contains("Number").click({ force: true });
      cy.wait("@fieldUpdate");

      cy.reload();
      cy.contains("Number");
    });

    it("lets you change the type to 'Foreign key' and choose the target field", () => {
      cy.visit(ORDERS_PRODUCT_URL);

      cy.contains("Number").click();
      cy.get(".ReactVirtualized__Grid").scrollTo(0, 0); // HACK: scroll to the top of the list. Ideally we should probably disable AccordianList virtualization
      cy.contains("Foreign Key").click({ force: true });
      cy.wait("@fieldUpdate");

      cy.contains("Select a target").click();
      cy.contains("Products → ID").click();
      cy.wait("@fieldUpdate");

      cy.reload();
      cy.contains("Foreign Key");
      cy.contains("Products → ID");
    });
  });

  describe("Filtering on this field", () => {
    before(restore);

    it("lets you change to 'Search box'", () => {
      cy.visit(ORDERS_QUANTITY_URL);

      cy.contains("A list of all values").click();
      cy.contains("Search box").click();
      cy.wait("@fieldUpdate");

      cy.reload();
      cy.contains("Search box");
    });
  });

  describe("Display Values", () => {
    before(restore);

    it("lets you change to 'Use foreign key' and change the target for field with fk", () => {
      cy.visit(ORDERS_PRODUCT_URL);

      cy.contains("Use original value").click();
      cy.contains("Use foreign key").click();
      cy.contains("Title").click();
      cy.wait("@fieldDimensionUpdate");

      cy.reload();
      cy.contains("Use foreign key");
      cy.contains("Title");
    });

    it("lets you change to 'Custom mapping' and set custom values", () => {
      cy.visit(ORDERS_QUANTITY_URL);

      cy.contains("Use original value").click();
      cy.contains("Custom mapping").click();

      cy.get('input[value="0"]')
        .clear()
        .type("foo")
        .blur();
      cy.contains("button", "Save").click({ force: true });
      cy.wait("@fieldValuesUpdate");

      cy.reload();
      cy.contains("Custom mapping");
      cy.get('input[value="foo"]');
    });
  });
});
