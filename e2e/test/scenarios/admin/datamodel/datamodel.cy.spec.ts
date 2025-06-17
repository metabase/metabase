import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
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

describe("scenarios > admin > datamodel > field", () => {
  const ordersColumns: (keyof typeof ORDERS)[] = [
    "CREATED_AT",
    "PRODUCT_ID",
    "QUANTITY",
  ];

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    ordersColumns.forEach((name) => {
      cy.wrap(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS[name]}/general`,
      ).as(`ORDERS_${name}_URL`);
    });

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
    cy.intercept("POST", "/api/field/*/values").as("fieldValuesUpdate");
    cy.intercept("POST", "/api/field/*/dimension").as("fieldDimensionUpdate");
  });

  it("lets you change field name and description", () => {
    H.visitAlias("@ORDERS_CREATED_AT_URL");

    // update the name
    cy.findByTestId("field-section")
      .findByPlaceholderText("Give this field a name")
      .should("have.value", "Created At")
      .clear()
      .type("new display_name")
      .blur();
    cy.wait("@fieldUpdate");

    // update the description
    cy.findByTestId("field-section")
      .findByPlaceholderText("Give this field a description")
      .should("have.value", "The date and time an order was submitted.")
      .clear()
      .type("new description")
      .blur();
    cy.wait("@fieldUpdate");

    // reload and verify they have been updated
    cy.reload();
    cy.findByTestId("field-section")
      .findByPlaceholderText("Give this field a name")
      .should("have.value", "new display_name");
    cy.findByTestId("field-section")
      .findByPlaceholderText("Give this field a description")
      .should("have.value", "new description");
  });

  it("should allow you to change field formatting", () => {
    H.visitAlias("@ORDERS_QUANTITY_URL");

    cy.findByLabelText("Style").click();
    H.popover().findByText("Percent").click();
    cy.wait("@fieldUpdate");

    H.undoToast()
      .findByText("Field formatting for Quantity updated")
      .should("be.visible");
  });

  it("lets you change field visibility", () => {
    H.visitAlias("@ORDERS_CREATED_AT_URL");

    cy.findByPlaceholderText("Select a field visibility").click();
    H.popover().findByText("Do not include").click();
    cy.wait("@fieldUpdate");

    cy.reload();
    cy.findByPlaceholderText("Select a field visibility")
      .should("have.value", "Do not include")
      .and("be.visible");
  });

  it("lets you change to 'Search box'", () => {
    H.visitAlias("@ORDERS_QUANTITY_URL");

    cy.findByPlaceholderText("Select field filtering").click();
    H.popover().findByText("Search box").click();
    cy.wait("@fieldUpdate");

    cy.reload();
    cy.findByPlaceholderText("Select field filtering")
      .scrollIntoView()
      .should("have.value", "Search box")
      .and("be.visible");
  });

  it("lets you change to 'Use foreign key' and change the target for field with fk", () => {
    H.visitAlias("@ORDERS_PRODUCT_ID_URL");

    cy.findByPlaceholderText("Select display values").click();
    H.popover().findByText("Use foreign key").click();
    H.popover().findByText("Title").click();
    cy.wait("@fieldDimensionUpdate");

    cy.reload();
    cy.findByPlaceholderText("Select display values")
      .scrollIntoView()
      .should("have.value", "Use foreign key")
      .and("be.visible");
    cy.findByPlaceholderText("Choose a field")
      .should("have.value", "Title")
      .and("be.visible");
  });

  it("allows 'Custom mapping' null values", () => {
    const dbId = 2;
    const remappedNullValue = "nothin";

    H.restore("withSqlite");
    cy.signInAsAdmin();

    H.withDatabase(
      dbId,
      ({ NUMBER_WITH_NULLS: { NUM }, NUMBER_WITH_NULLS_ID }) => {
        cy.request("GET", `/api/database/${dbId}/schemas`).then(({ body }) => {
          const [schema] = body;

          cy.visit(
            `/admin/datamodel/database/${dbId}/schema/${dbId}:${schema}/table/${NUMBER_WITH_NULLS_ID}/field/${NUM}/general`,
          );
        });

        cy.log("Change `null` to custom mapping");
        cy.findByPlaceholderText("Select display values")
          .scrollIntoView()
          .click();
        H.popover().findByText("Custom mapping").click();

        H.modal()
          .should("be.visible")
          .within(() => {
            cy.findAllByPlaceholderText("Enter value")
              .filter("[value='null']")
              .clear()
              .type(remappedNullValue);
            cy.button("Save").click();
          });
        cy.wait("@fieldValuesUpdate");

        cy.log("Make sure custom mapping appears in QB");
        H.openTable({ database: dbId, table: NUMBER_WITH_NULLS_ID });
        cy.findAllByRole("gridcell").should("contain", remappedNullValue);
      },
    );
  });
});

describe("Unfold JSON", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_data_types" });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "many_data_types" });
    cy.intercept("POST", `/api/database/${WRITABLE_DB_ID}/sync_schema`).as(
      "sync_schema",
    );
  });

  it("lets you enable/disable 'Unfold JSON' for JSON columns", () => {
    // Go to field settings
    cy.visit(`/admin/datamodel/database/${WRITABLE_DB_ID}`);
    cy.findAllByTestId("tree-item")
      .contains(/Many Data Types/)
      .click();

    // Check json is unfolded initially
    cy.findByLabelText("Json → A").should("be.visible");
    cy.findByLabelText("Json").click();

    cy.findByPlaceholderText("Select whether to unfold JSON")
      .should("have.value", "Yes")
      .click();
    H.popover().findByText("No").click();

    // Check setting has persisted
    cy.reload();
    cy.findByPlaceholderText("Select whether to unfold JSON").should(
      "have.value",
      "No",
    );

    // Sync database
    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    cy.button("Sync database schema").click();
    cy.wait("@sync_schema");
    cy.button(/Sync triggered!/).should("be.visible");

    // Check json field is not unfolded
    cy.visit(`/admin/datamodel/database/${WRITABLE_DB_ID}`);
    cy.findAllByTestId("tree-item")
      .contains(/Many Data Types/)
      .click();
    cy.findByLabelText("Json → A").should("not.exist");
  });
});
