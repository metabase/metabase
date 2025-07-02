import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { TableId } from "metabase-types/api";

const { H } = cy;
const { ORDERS, ORDERS_ID, PRODUCTS, REVIEWS, REVIEWS_ID, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > field > field type", () => {
  function waitAndAssertOnResponse(alias: string) {
    cy.wait("@" + alias).then((request) => {
      expect(request.response?.body.errors).to.not.exist;
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
  });

  it("should let you change the type to 'No semantic type'", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });
    cy.wait(["@metadata", "@metadata"]);

    H.DataModel.FieldSection.getSemanticTypeInput()
      .should("have.value", "Foreign Key")
      .click();
    H.popover().findByText("No semantic type").click();

    waitAndAssertOnResponse("fieldUpdate");

    cy.reload();
    cy.wait("@metadata");

    H.DataModel.FieldSection.getSemanticTypeInput().should(
      "have.value",
      "No semantic type",
    );
  });

  it("should let you change the type to 'Foreign Key' and choose the target field", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.QUANTITY,
    });
    cy.wait("@metadata");

    H.DataModel.FieldSection.getSemanticTypeInput()
      .should("have.value", "Quantity")
      .click();
    H.popover().findByText("Foreign Key").click();
    waitAndAssertOnResponse("fieldUpdate");

    H.DataModel.FieldSection.getSemanticTypeFkTarget().click();
    H.popover().findByText("Products → ID").click();
    waitAndAssertOnResponse("fieldUpdate");

    cy.reload();
    cy.wait(["@metadata", "@metadata"]);

    H.DataModel.FieldSection.getSemanticTypeFkTarget()
      .should("be.visible")
      .and("have.value", "Products → ID");
  });

  it("should correctly filter out options in Foreign Key picker (metabase#56839)", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });
    cy.wait(["@metadata", "@metadata"]);

    H.DataModel.FieldSection.getSemanticTypeFkTarget().focus().clear();
    H.popover()
      .should("contain.text", "Orders → ID")
      .and("contain.text", "People → ID")
      .and("contain.text", "Products → ID")
      .and("contain.text", "Reviews → ID");

    cy.log("should case-insensitive match field display name");
    H.DataModel.FieldSection.getSemanticTypeFkTarget().focus().type("id");
    H.popover()
      .should("contain.text", "Orders → ID")
      .and("contain.text", "People → ID")
      .and("contain.text", "Products → ID")
      .and("contain.text", "Reviews → ID");

    cy.log("should case-insensitive match field description");
    H.DataModel.FieldSection.getSemanticTypeFkTarget()
      .focus()
      .clear()
      .type("EXT");
    H.popover()
      .should("not.contain.text", "Orders → ID")
      .and("not.contain.text", "People → ID")
      .and("contain.text", "Products → ID")
      .and("contain.text", "Reviews → ID");
  });

  it("should not let you change the type to 'Number' (metabase#16781)", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });
    cy.wait(["@metadata", "@metadata"]);

    H.DataModel.FieldSection.getSemanticTypeInput().click();
    H.popover()
      .should("contain.text", "Foreign Key")
      .and("not.contain.text", "Number");
  });
});

describe("scenarios > admin > datamodel > field", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
    cy.intercept("POST", "/api/field/*/values").as("fieldValuesUpdate");
    cy.intercept("POST", "/api/field/*/dimension").as("fieldDimensionUpdate");
  });

  it("lets you change field name and description", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.CREATED_AT,
    });

    // update the name
    H.DataModel.FieldSection.getNameInput()
      .should("have.value", "Created At")
      .clear()
      .type("new display_name")
      .blur();
    cy.wait("@fieldUpdate");

    // update the description
    H.DataModel.FieldSection.getDescriptionInput()
      .should("have.value", "The date and time an order was submitted.")
      .clear()
      .type("new description")
      .blur();
    cy.wait("@fieldUpdate");

    // reload and verify they have been updated
    cy.reload();
    H.DataModel.FieldSection.getNameInput().should(
      "have.value",
      "new display_name",
    );
    H.DataModel.FieldSection.getDescriptionInput().should(
      "have.value",
      "new description",
    );
  });

  it("should allow you to change field formatting", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.QUANTITY,
    });

    H.DataModel.FieldSection.getStyleInput().click();
    H.popover().findByText("Percent").click();
    cy.wait("@fieldUpdate");

    H.undoToast().should(
      "contain.text",
      "Field formatting for Quantity updated",
    );
  });

  it("lets you change field visibility", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.CREATED_AT,
    });

    H.DataModel.FieldSection.getVisibilityInput().click();
    H.popover().findByText("Do not include").click();
    cy.wait("@fieldUpdate");

    cy.reload();
    H.DataModel.FieldSection.getVisibilityInput()
      .scrollIntoView()
      .should("be.visible")
      .and("have.value", "Do not include");
  });

  it("lets you change to 'Search box'", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.QUANTITY,
    });

    H.DataModel.FieldSection.getFilteringInput().click();
    H.popover().findByText("Search box").click();
    cy.wait("@fieldUpdate");

    cy.reload();
    H.DataModel.FieldSection.getFilteringInput()
      .scrollIntoView()
      .should("be.visible")
      .and("have.value", "Search box");
  });

  it("lets you change to 'Use foreign key' and change the target for field with fk", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });

    H.DataModel.FieldSection.getDisplayValuesInput().click();
    H.popover().findByText("Use foreign key").click();
    H.popover().findByText("Title").click();
    cy.wait("@fieldDimensionUpdate");

    cy.reload();
    H.DataModel.FieldSection.getDisplayValuesInput()
      .scrollIntoView()
      .should("be.visible")
      .and("have.value", "Use foreign key");
    H.DataModel.FieldSection.getDisplayValuesFkTargetInput()
      .should("be.visible")
      .and("have.value", "Title");
  });

  it("allows 'Custom mapping' null values", () => {
    const databaseId = 2;
    const remappedNullValue = "nothin";

    H.restore("withSqlite");
    cy.signInAsAdmin();

    H.withDatabase(
      databaseId,
      ({ NUMBER_WITH_NULLS: { NUM }, NUMBER_WITH_NULLS_ID }) => {
        cy.request("GET", `/api/database/${databaseId}/schemas`).then(
          ({ body }) => {
            const [schemaName] = body;

            H.DataModel.visit({
              databaseId,
              schemaId: `${databaseId}:${schemaName}`,
              tableId: NUMBER_WITH_NULLS_ID,
              fieldId: NUM,
            });
          },
        );

        cy.log("Change `null` to custom mapping");
        H.DataModel.FieldSection.getDisplayValuesInput()
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
        H.openTable({ database: databaseId, table: NUMBER_WITH_NULLS_ID });
        cy.findAllByRole("gridcell", { name: remappedNullValue }).should(
          "be.visible",
        );
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
    H.DataModel.visit({ databaseId: WRITABLE_DB_ID });
    H.DataModel.TablePicker.getTable("Many Data Types").click();

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
    H.DataModel.visit({ databaseId: WRITABLE_DB_ID });
    H.DataModel.TablePicker.getTable("Many Data Types").click();
    cy.findByLabelText("Json → A").should("not.exist");
  });
});

describe("scenarios > admin > datamodel > hidden tables (metabase#9759)", () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("PUT", `/api/table/${ORDERS_ID}`).as("tableUpdate");
  });

  it("hidden table should not show up in various places in UI", () => {
    cy.signInAsAdmin();

    // Toggle the orders table to be hidden as admin user
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
    });
    H.DataModel.TablePicker.getTable("Orders").button("Hide table").click();
    cy.wait("@tableUpdate");

    // Visit the main page, we shouldn't be able to see the table
    cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);

    cy.findByTestId("browse-schemas")
      .findByText("Products")
      .should("be.visible");
    cy.findByTestId("browse-schemas").findByText("Orders").should("not.exist");

    // It shouldn't show up for a normal user either
    cy.signInAsNormalUser();
    cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);

    cy.findByTestId("browse-schemas")
      .findByText("Products")
      .should("be.visible");
    cy.findByTestId("browse-schemas").findByText("Orders").should("not.exist");

    // It shouldn't show in a new question data picker
    H.startNewQuestion();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.contains("Products").should("exist");
      cy.contains("Orders").should("not.exist");
    });
  });
});

describe("scenarios > admin > datamodel > metadata", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
    cy.intercept("POST", "/api/field/*/dimension").as("fieldDimensionUpdate");
    cy.intercept("POST", "/api/field/*/values").as("fieldValuesUpdate");
  });

  it("should remap FK display value from field section", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });

    H.DataModel.FieldSection.getNameInput()
      .clear()
      .type("Remapped Product ID")
      .realPress("Tab");
    cy.wait("@fieldUpdate");

    H.openOrdersTable({ limit: 5 });
    cy.findAllByTestId("header-cell").should("contain", "Remapped Product ID");
  });

  it("should remap FK display value from the table section", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
    });

    H.DataModel.TableSection.getFieldNameInput("Product ID")
      .clear()
      .type("Remapped Product ID")
      .realPress("Tab");
    cy.wait("@fieldUpdate");

    H.openOrdersTable({ limit: 5 });
    cy.findAllByTestId("header-cell").should("contain", "Remapped Product ID");
  });

  it("should correctly show remapped column value", () => {
    H.DataModel.visit({ databaseId: SAMPLE_DB_ID });

    // edit "Product ID" column in "Orders" table
    H.DataModel.TablePicker.getTable("Orders").click();
    H.DataModel.TableSection.clickField("Product ID");

    // remap its original value to use foreign key
    H.DataModel.FieldSection.getDisplayValuesInput().click();
    H.popover().findByText("Use foreign key").click();
    H.popover().findByText("Title").click();

    cy.findByTestId("field-section")
      .findByText(
        "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
      )
      .scrollIntoView()
      .should("be.visible");

    cy.log("Name of the product should be displayed instead of its ID");
    H.openOrdersTable();
    cy.findByRole("gridcell", { name: "Awesome Concrete Shoes" }).should(
      "be.visible",
    );
  });

  it("should correctly apply and display custom remapping for numeric values", () => {
    // this test also indirectly reproduces metabase#12771
    const customMap = {
      1: "Awful",
      2: "Unpleasant",
      3: "Meh",
      4: "Enjoyable",
      5: "Perfecto",
    };

    H.DataModel.visit({ databaseId: SAMPLE_DB_ID });
    // edit "Rating" values in "Reviews" table
    H.DataModel.TablePicker.getTable("Reviews").click();
    H.DataModel.TableSection.clickField("Rating");

    // apply custom remapping for "Rating" values 1-5
    H.DataModel.FieldSection.getDisplayValuesInput().click();
    H.popover().findByText("Custom mapping").click();
    H.modal().within(() => {
      cy.findByText(
        "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
      ).should("be.visible");

      Object.entries(customMap).forEach(([key, value]) => {
        cy.findByDisplayValue(key).click().clear().type(value);
      });

      cy.button("Save").click();
    });
    cy.wait("@fieldValuesUpdate");

    cy.log("Numeric ratings should be remapped to custom strings");
    H.openReviewsTable();
    Object.values(customMap).forEach((rating) => {
      cy.findAllByText(rating).eq(0).scrollIntoView().should("be.visible");
    });
  });

  it("semantic picker should not overflow the screen on smaller viewports (metabase#56442)", () => {
    const viewportHeight = 400;

    cy.viewport(1280, viewportHeight);
    H.DataModel.visit({ databaseId: SAMPLE_DB_ID });
    H.DataModel.TablePicker.getTable("Reviews").scrollIntoView().click();
    H.DataModel.TableSection.clickField("ID");
    H.DataModel.FieldSection.getSemanticTypeInput().click();

    H.popover().scrollTo("top");
    H.popover()
      .findByText("Entity Key")
      .should(($element) => {
        const rect = $element[0].getBoundingClientRect();
        expect(rect.top).greaterThan(0);
      });

    H.popover().scrollTo("bottom");
    H.popover()
      .findByText("No semantic type")
      .should(($element) => {
        const rect = $element[0].getBoundingClientRect();
        expect(rect.bottom).lessThan(viewportHeight);
      });
  });

  it("display value 'Custom mapping' should be available only for 'Search box' filtering type (metabase#16322)", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: REVIEWS_ID,
      fieldId: REVIEWS.RATING,
    });

    H.DataModel.FieldSection.getFilteringInput().click();
    H.popover().findByText("Search box").click();
    cy.wait("@fieldUpdate");

    H.DataModel.FieldSection.getDisplayValuesInput().click();
    H.popover()
      .findByRole("option", { name: /Custom mapping/ })
      .should("have.attr", "data-combobox-disabled", "true");
    H.popover()
      .findByRole("option", { name: /Custom mapping/ })
      .icon("info")
      .realHover();
    H.tooltip()
      .should("be.visible")
      .and(
        "have.text",
        'You can only use custom mapping for numerical fields with filtering set to "A list of all values"',
      );

    H.DataModel.FieldSection.getFilteringInput().click();
    H.popover().findByText("A list of all values").click();

    H.DataModel.FieldSection.getDisplayValuesInput().click();
    H.popover()
      .findByRole("option", { name: /Custom mapping/ })
      .should("not.have.attr", "data-combobox-disabled");
  });

  it("allows to map FK to date fields (metabase#7108)", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.USER_ID,
    });

    H.DataModel.FieldSection.getDisplayValuesInput().click();
    H.popover().findByText("Use foreign key").click();
    H.DataModel.FieldSection.getDisplayValuesFkTargetInput().click();

    H.popover().within(() => {
      cy.findByText("Birth Date").scrollIntoView().should("be.visible");
      cy.findByText("Created At").scrollIntoView().should("be.visible").click();
    });
    cy.wait("@fieldDimensionUpdate");

    H.visitQuestion(ORDERS_QUESTION_ID);
    cy.findAllByTestId("cell-data")
      .eq(10) // 1st data row, 2nd column (User ID)
      .should("have.text", "2023-10-07T01:34:35.462-07:00");
  });

  describe("column formatting options", () => {
    beforeEach(() => {
      cy.intercept("PUT", "/api/field/*", cy.spy().as("updateFieldSpy")).as(
        "updateField",
      );
      cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
    });

    it("should only show currency formatting options for currency fields", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.DISCOUNT,
      });
      cy.wait("@metadata");

      cy.findByTestId("column-settings")
        .scrollIntoView()
        .within(() => {
          cy.findByText("Unit of currency").should("be.visible");
          cy.findByText("Currency label style").should("be.visible");
        });

      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });
      cy.wait("@metadata");

      cy.findByTestId("column-settings")
        .scrollIntoView()
        .within(() => {
          // shouldnt show currency settings by default for quantity field
          cy.findByText("Unit of currency").should("not.be.visible");
          cy.findByText("Currency label style").should("not.be.visible");

          cy.get("#number_style").click();
        });

      // if you change the style to currency, currency settings should appear
      H.popover().findByText("Currency").click();
      cy.wait("@updateField");

      cy.findByTestId("column-settings").within(() => {
        cy.findByText("Unit of currency").should("be.visible");
        cy.findByText("Currency label style").should("be.visible");
      });
    });

    it("should save and obey field prefix formatting settings", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });
      cy.wait("@metadata");

      H.DataModel.FieldSection.getPrefixInput()
        .scrollIntoView()
        .type("about ")
        .blur();
      cy.wait("@updateField");

      H.visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["sum", ["field", ORDERS.QUANTITY, null]]],
          },
          type: "query",
        },
      });
      cy.findByTestId("visualization-root")
        .findByText("about 69,540")
        .should("be.visible");
    });

    it("should not call PUT field endpoint when prefix or suffix has not been changed (SEM-359)", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });
      cy.wait("@metadata");

      H.DataModel.FieldSection.getPrefixInput().focus().blur();
      cy.get("@updateFieldSpy").should("not.have.been.called");
      H.undoToast().should("not.exist");

      H.DataModel.FieldSection.getSuffixInput().focus().blur();
      cy.get("@updateFieldSpy").should("not.have.been.called");
      H.undoToast().should("not.exist");
    });
  });
});

describe("scenarios > admin > databases > table", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should see 8 tables in sample database", () => {
    H.DataModel.visit({ databaseId: SAMPLE_DB_ID });
    H.DataModel.TablePicker.getTables().should("have.length", 8);
  });

  it("should be able to see details of each table", () => {
    H.DataModel.visit({ databaseId: SAMPLE_DB_ID });

    cy.get("main")
      .findByText("Start by selecting data to model")
      .should("be.visible");

    // Orders
    H.DataModel.TablePicker.getTable("Orders").click();
    cy.get("main").findByText("Edit the table and fields").should("be.visible");

    H.DataModel.TableSection.getDescriptionInput().should(
      "have.value",
      "Confirmed Sample Company orders for a product, from a user.",
    );
  });

  // https://linear.app/metabase/issue/SEM-423/data-loading-error-handling
  it.skip("should show 404 if database does not exist (metabase#14652)", () => {
    H.DataModel.visit({ databaseId: 54321 });

    cy.findAllByTestId("tree-item")
      .filter('[data-type="table"]')
      .should("have.length", 0);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not found.");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a database");
  });

  describe("in orders table", () => {
    beforeEach(() => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });
    });

    it("should see multiple fields", () => {
      H.DataModel.TableSection.clickField("ID");
      H.DataModel.FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "BIGINT");
      H.DataModel.FieldSection.getSemanticTypeInput().should(
        "have.value",
        "Entity Key",
      );

      H.DataModel.TableSection.clickField("User ID");
      H.DataModel.FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "INTEGER");
      H.DataModel.FieldSection.getSemanticTypeInput().should(
        "have.value",
        "Foreign Key",
      );
      H.DataModel.FieldSection.getSemanticTypeFkTarget().should(
        "have.value",
        "People → ID",
      );

      H.DataModel.TableSection.clickField("Tax");
      H.DataModel.FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "DOUBLE PRECISION");
      H.DataModel.FieldSection.getSemanticTypeInput().should(
        "have.value",
        "No semantic type",
      );

      H.DataModel.TableSection.clickField("Discount");
      H.DataModel.FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "DOUBLE PRECISION");
      H.DataModel.FieldSection.getSemanticTypeInput().should(
        "have.value",
        "Discount",
      );

      H.DataModel.TableSection.clickField("Created At");
      H.DataModel.FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "TIMESTAMP");
      H.DataModel.FieldSection.getSemanticTypeInput().should(
        "have.value",
        "Creation timestamp",
      );
    });
  });

  describe("turning table visibility off shouldn't prevent editing related question (metabase#15947)", () => {
    it("simple question (metabase#15947-1)", () => {
      turnTableVisibilityOff(ORDERS_ID);
      H.visitQuestion(ORDERS_QUESTION_ID);

      H.queryBuilderHeader().findByText("View-only").should("be.visible");
    });

    it.skip("question with joins (metabase#15947-2)", () => {
      H.createQuestion({
        name: "15947",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              "source-table": PRODUCTS_ID,
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Products" }],
              ],
              alias: "Products",
            },
          ],
          filter: [
            "and",
            ["=", ["field", ORDERS.QUANTITY, null], 1],
            [">", ["field", PRODUCTS.RATING, { "join-alias": "Products" }], 3],
          ],
          aggregation: [
            ["sum", ["field", ORDERS.TOTAL, null]],
            ["sum", ["field", PRODUCTS.RATING, { "join-alias": "Products" }]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
          ],
        },
      }).then(({ body: { id: QUESTION_ID } }) => {
        turnTableVisibilityOff(PRODUCTS_ID);
        cy.visit(`/question/${QUESTION_ID}/notebook`);
        cy.findByText("Products");
        cy.findByText("Quantity is equal to 1");
        cy.findByText("Rating is greater than 3");
        H.queryBuilderHeader().findByText("View-only").should("be.visible");
      });
    });

    function turnTableVisibilityOff(tableId: TableId) {
      cy.request("PUT", "/api/table", {
        ids: [tableId],
        visibility_type: "hidden",
      });
    }
  });
});
