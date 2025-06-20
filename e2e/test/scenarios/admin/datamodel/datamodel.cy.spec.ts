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
    H.popover().findByText(newValue).click();
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
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
  });

  it("should let you change the type to 'No semantic type'", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });
    cy.wait(["@metadata", "@metadata"]);

    setFieldType({ oldValue: "Foreign Key", newValue: "No semantic type" });
    waitAndAssertOnResponse("fieldUpdate");

    cy.reload();
    cy.wait("@metadata");

    getFieldType().should("have.value", "No semantic type");
  });

  it("should let you change the type to 'Foreign Key' and choose the target field", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.QUANTITY,
    });
    cy.wait("@metadata");

    setFieldType({ oldValue: "Quantity", newValue: "Foreign Key" });
    waitAndAssertOnResponse("fieldUpdate");

    setFKTargetField("Products → ID");
    waitAndAssertOnResponse("fieldUpdate");

    cy.reload();
    cy.wait(["@metadata", "@metadata"]);

    getFieldType().should("be.visible");
    cy.findByTestId("fk-target-select").should("have.value", "Products → ID");
  });

  it("should correctly filter out options in Foreign Key picker (metabase#56839)", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });
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
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });
    cy.wait(["@metadata", "@metadata"]);

    checkNoFieldType({ oldValue: "Foreign Key", newValue: "Number" });
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
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.CREATED_AT,
    });

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
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.QUANTITY,
    });

    cy.findByLabelText("Style").click();
    H.popover().findByText("Percent").click();
    cy.wait("@fieldUpdate");

    H.undoToast()
      .findByText("Field formatting for Quantity updated")
      .should("be.visible");
  });

  it("lets you change field visibility", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.CREATED_AT,
    });

    cy.findByPlaceholderText("Select a field visibility").click();
    H.popover().findByText("Do not include").click();
    cy.wait("@fieldUpdate");

    cy.reload();
    cy.findByPlaceholderText("Select a field visibility")
      .should("have.value", "Do not include")
      .and("be.visible");
  });

  it("lets you change to 'Search box'", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.QUANTITY,
    });

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
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });

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
              schemaName,
              tableId: NUMBER_WITH_NULLS_ID,
              fieldId: NUM,
            });
          },
        );

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
    H.DataModel.visit({ databaseId: WRITABLE_DB_ID });
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
      schemaName: SAMPLE_DB_SCHEMA_ID,
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
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });

    cy.findByTestId("field-section")
      .findByPlaceholderText("Give this field a name")
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
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
    });

    cy.findByTestId("table-section")
      .findByDisplayValue("Product ID")
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
    cy.findByPlaceholderText("Select display values").click();
    H.popover().findByText("Use foreign key").click();
    H.popover().findByText("Title").click();

    cy.findByTestId("field-section").findByText(
      "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
    );

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
    cy.findByPlaceholderText("Select display values").click();
    H.popover().findByText("Custom mapping").click();
    H.modal().within(() => {
      cy.findByText(
        "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
      ).should("be.visible");

      Object.entries(customMap).forEach(([key, value]) => {
        cy.findByDisplayValue(key).click().clear().type(value);
      });

      cy.findByText("Save").click();
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
    cy.findByPlaceholderText("Select a semantic type").click();

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
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: REVIEWS_ID,
      fieldId: REVIEWS.RATING,
    });

    cy.findByPlaceholderText("Select field filtering").click();
    H.popover().findByText("Search box").click();
    cy.wait("@fieldUpdate");

    cy.findByPlaceholderText("Select display values").click();
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

    cy.findByPlaceholderText("Select field filtering").click();
    H.popover().findByText("A list of all values").click();

    cy.findByPlaceholderText("Select display values").click();
    H.popover()
      .findByRole("option", { name: /Custom mapping/ })
      .should("not.have.attr", "data-combobox-disabled");
  });

  it("allows to map FK to date fields (metabase#7108)", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaName: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.USER_ID,
    });
    cy.findByPlaceholderText("Select display values").click();
    H.popover().findByText("Use foreign key").click();
    cy.findByPlaceholderText("Choose a field").click();

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
        schemaName: SAMPLE_DB_SCHEMA_ID,
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
        schemaName: SAMPLE_DB_SCHEMA_ID,
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
        schemaName: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });
      cy.wait("@metadata");

      cy.findByTestId("column-settings")
        .scrollIntoView()
        .findByTestId("prefix")
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
        schemaName: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });
      cy.wait("@metadata");

      cy.findByTestId("column-settings").findByTestId("prefix").focus().blur();
      cy.get("@updateFieldSpy").should("not.have.been.called");
      H.undoToast().should("not.exist");

      cy.findByTestId("column-settings").findByTestId("suffix").focus().blur();
      cy.get("@updateFieldSpy").should("not.have.been.called");
      H.undoToast().should("not.exist");
    });
  });
});

describe("scenarios > admin > datamodel > segments", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.viewport(1400, 860);
  });

  describe("with no segments", () => {
    it("should have 'Custom expression' in a filter list (metabase#13069)", () => {
      cy.visit("/admin/datamodel/segments");

      cy.log("should initially show no segments in UI");
      cy.get("main").findByText(
        "Create segments to add them to the Filter dropdown in the query builder",
      );

      cy.button("New segment").click();

      cy.findByTestId("segment-editor").findByText("Select a table").click();
      H.entityPickerModal().within(() => {
        cy.findByText("Orders").click();
      });

      cy.findByTestId("segment-editor").findByText("Orders").should("exist");

      cy.findByTestId("segment-editor")
        .findByText("Add filters to narrow your answer")
        .click();

      cy.log("Fails in v0.36.0 and v0.36.3. It exists in v0.35.4");
      H.popover().findByText("Custom Expression");
    });

    it("should show no segments", () => {
      cy.visit("/reference/segments");

      cy.get("main")
        .findByText("Segments are interesting subsets of tables")
        .should("be.visible");
      cy.button("Learn how to create segments").should("be.visible");
    });
  });

  describe("with segment", () => {
    const SEGMENT_NAME = "Orders < 100";

    beforeEach(() => {
      // Create a segment through API
      H.createSegment({
        name: SEGMENT_NAME,
        description: "All orders with a total under $100.",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      }).then(({ body }) => {
        cy.wrap(body.id).as("segmentId");
      });
    });

    it("should show the segment fields list and detail view", () => {
      // In the list
      cy.visit("/reference/segments");

      cy.findByTestId("data-reference-list-item")
        .findByText(SEGMENT_NAME)
        .should("be.visible")
        .click();

      // Detail view
      cy.get("main").findByText("Description").should("be.visible");
      cy.button("See this segment").should("be.visible");

      // Segment fields
      cy.findByRole("link", { name: /Fields in this segment/ }).click();
      cy.button("See this segment").should("not.exist");
      cy.get("main")
        .findByText(`Fields in ${SEGMENT_NAME}`)
        .should("be.visible");
      cy.get("main")
        .findAllByText("Discount")
        .should("have.length", 2)
        .eq(0)
        .scrollIntoView()
        .should("be.visible");
    });

    it("should not crash when editing field in segment field detail page (metabase#55322)", () => {
      cy.get("@segmentId").then((segmentId) => {
        cy.visit(`/reference/segments/${segmentId}/fields/${ORDERS.TAX}`);
      });

      cy.button(/Edit/).should("be.visible").realClick();

      cy.findByPlaceholderText("No description yet").should("be.visible");
      cy.get("main").findByText("Something’s gone wrong").should("not.exist");
    });

    it("should show up in UI list and should show the segment details of a specific id", () => {
      cy.visit("/admin/datamodel/segments");

      cy.findByRole("table").within(() => {
        cy.findByText("Filtered by Total is less than 100").should(
          "be.visible",
        );
        cy.findByText("Sample Database").should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });
      cy.findByRole("link", { name: /Orders < 100/ })
        .should("be.visible")
        .click();

      cy.get("form").within(() => {
        cy.findByText("Edit Your Segment").should("be.visible");
        cy.findByText("Sample Database").should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });
      cy.findByPlaceholderText("Something descriptive but not too long").should(
        "have.value",
        SEGMENT_NAME,
      );
      cy.findByRole("link", { name: "Preview" }).should("be.visible");
    });

    it("should see a newly asked question in its questions list", () => {
      cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
      // Ask question
      cy.visit("/reference/segments/1/questions");
      cy.wait(["@metadata", "@metadata", "@metadata"]);

      cy.get("main").should("contain", `Questions about ${SEGMENT_NAME}`);
      cy.findByRole("status")
        .as("emptyStateMessage")
        .should(
          "have.text",
          "Questions about this segment will appear here as they're added",
        );

      cy.button("Ask a question").click();
      cy.findByTestId("filter-pill").should("have.text", "Orders < 100");
      cy.findAllByTestId("cell-data").should("contain", "37.65");

      H.summarize();
      cy.findAllByTestId("sidebar-right").button("Done").click();
      cy.findByTestId("scalar-value").should("have.text", "13,005");
      H.saveQuestion("Foo");

      // Check list
      cy.visit("/reference/segments/1/questions");
      cy.wait(["@metadata", "@metadata", "@metadata"]);

      cy.get("@emptyStateMessage").should("not.exist");
      cy.findByTestId("data-reference-list-item")
        .findByText("Foo")
        .should("be.visible");
    });

    it("should update that segment", () => {
      cy.visit("/admin");
      cy.findByTestId("admin-navbar-items").contains("Table Metadata").click();
      cy.findByRole("link", { name: /Segments/ }).click();

      cy.findByTestId("segment-list-app")
        .contains(SEGMENT_NAME)
        .parent()
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      H.popover().contains("Edit Segment").click();

      // update the filter from "< 100" to "> 10"
      cy.url().should("match", /segment\/1$/);
      cy.get("label").contains("Edit Your Segment");
      cy.findByTestId("filter-pill")
        .contains(/Total\s+is less than/)
        .click();
      H.popover().findByLabelText("Filter operator").click();
      H.popover().contains("Greater than").click();
      H.popover().findByPlaceholderText("Enter a number").type("{SelectAll}10");
      H.popover().contains("Update filter").click();

      // confirm that the preview updated
      cy.findByTestId("segment-editor").contains("18758 rows");

      // update name and description, set a revision note, and save the update
      cy.get('[name="name"]').clear().type("Orders > 10");
      cy.get('[name="description"]')
        .clear()
        .type("All orders with a total over $10.");
      cy.get('[name="revision_message"]').type("time for a change");
      cy.findByTestId("field-set-content").findByText("Save changes").click();

      // get redirected to previous page and see the new segment name
      cy.url().should("match", /datamodel\/segments$/);

      cy.findByTestId("segment-list-app").findByText("Orders > 10");

      // clean up
      cy.findByTestId("segment-list-app")
        .contains("Orders > 10")
        .parent()
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      H.popover().findByText("Retire Segment").click();
      H.modal().find("textarea").type("delete it");
      H.modal().contains("button", "Retire").click();
    });

    it("should show segment revision history (metabase#45577, metabase#45594)", () => {
      cy.request("PUT", "/api/segment/1", {
        description: "Medium orders",
        revision_message: "Foo",
      });

      cy.log("Make sure revisions are displayed properly in /references");
      cy.visit("/reference/segments/1/revisions");
      cy.findByTestId("segment-revisions").within(() => {
        cy.findByText(`Revision history for ${SEGMENT_NAME}`).should(
          "be.visible",
        );

        assertRevisionHistory();
      });

      cy.log(
        "Make sure revisions are displayed properly in admin table metadata",
      );
      cy.visit("/admin/datamodel/segments");
      cy.get("tr")
        .filter(`:contains(${SEGMENT_NAME})`)
        .icon("ellipsis")
        .click();
      H.popover().findByTextEnsureVisible("Revision History").click();

      cy.location("pathname").should(
        "eq",
        "/admin/datamodel/segment/1/revisions",
      );

      cy.findByTestId("segment-revisions").within(() => {
        // metabase#45594
        cy.findByRole("heading", {
          name: `Revision History for "${SEGMENT_NAME}"`,
        }).should("be.visible");

        assertRevisionHistory();
      });

      cy.findByTestId("breadcrumbs").within(() => {
        cy.findByText("Segment History");
        cy.findByRole("link", { name: "Segments" }).click();
      });

      cy.location("pathname").should("eq", "/admin/datamodel/segments");
      cy.location("search").should("eq", `?table=${ORDERS_ID}`);

      function assertRevisionHistory() {
        cy.findAllByRole("listitem").as("revisions").should("have.length", 2);
        cy.get("@revisions")
          .first()
          .should("contain", "You edited the description")
          .and("contain", "Foo");
        // eslint-disable-next-line no-unsafe-element-filtering
        cy.get("@revisions")
          .last()
          .should("contain", `You created "${SEGMENT_NAME}"`)
          .and("contain", "All orders with a total under $100.");
      }
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

    cy.findAllByTestId("tree-item")
      .filter('[data-type="table"]')
      .should("have.length", 8);
  });

  it("should be able to see details of each table", () => {
    H.DataModel.visit({ databaseId: SAMPLE_DB_ID });

    cy.get("main")
      .findByText("Start by selecting data to model")
      .should("be.visible");

    // Orders
    H.DataModel.TablePicker.getTable("Orders").click();
    cy.get("main").findByText("Edit the table and fields").should("be.visible");

    cy.findByPlaceholderText("Give this table a description").should(
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
        schemaName: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });
    });

    it("should see multiple fields", () => {
      H.DataModel.TableSection.clickField("ID");
      cy.findByLabelText("Data type")
        .should("be.visible")
        .and("have.value", "BIGINT");
      cy.findByPlaceholderText("Select a semantic type").should(
        "have.value",
        "Entity Key",
      );

      H.DataModel.TableSection.clickField("User ID");
      cy.findByLabelText("Data type")
        .should("be.visible")
        .and("have.value", "INTEGER");
      cy.findByPlaceholderText("Select a semantic type").should(
        "have.value",
        "Foreign Key",
      );
      cy.findByPlaceholderText("Select a target").should(
        "have.value",
        "People → ID",
      );

      H.DataModel.TableSection.clickField("Tax");
      cy.findByLabelText("Data type")
        .should("be.visible")
        .and("have.value", "DOUBLE PRECISION");
      cy.findByPlaceholderText("Select a semantic type").should(
        "have.value",
        "No semantic type",
      );

      H.DataModel.TableSection.clickField("Discount");
      cy.findByLabelText("Data type")
        .should("be.visible")
        .and("have.value", "DOUBLE PRECISION");
      cy.findByPlaceholderText("Select a semantic type").should(
        "have.value",
        "Discount",
      );

      H.DataModel.TableSection.clickField("Created At");
      cy.findByLabelText("Data type")
        .should("be.visible")
        .and("have.value", "TIMESTAMP");
      cy.findByPlaceholderText("Select a semantic type").should(
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
