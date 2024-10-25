import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  createSegment,
  entityPickerModal,
  entityPickerModalTab,
  filter,
  getNotebookStep,
  modal,
  openOrdersTable,
  openReviewsTable,
  openTable,
  popover,
  resetTestTable,
  restore,
  resyncDatabase,
  saveQuestion,
  startNewQuestion,
  summarize,
  visitAlias,
  visitQuestion,
  visitQuestionAdhoc,
  withDatabase,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, REVIEWS, REVIEWS_ID, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > field > field type", () => {
  const ordersColumns = ["PRODUCT_ID", "QUANTITY"];

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
      .findByTestId("fk-target-select")
      .as("targetField")
      .invoke("text")
      .should("eq", targetField);
  }

  function setFKTargetField(field) {
    cy.findByText("Select a target").click();

    popover().contains(field).click();
  }

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

  it(
    "should let you change the type to 'No semantic type'",
    { tags: "@flaky" },
    () => {
      visitAlias("@ORDERS_PRODUCT_ID_URL");
      cy.wait(["@metadata", "@metadata"]);

      setFieldType({ oldValue: "Foreign Key", newValue: "No semantic type" });

      waitAndAssertOnResponse("fieldUpdate");

      cy.reload();
      cy.wait("@metadata");

      getFieldType("No semantic type");
    },
  );

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

describe("scenarios > admin > datamodel > field", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    ["CREATED_AT", "PRODUCT_ID", "QUANTITY"].forEach(name => {
      cy.wrap(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS[name]}/general`,
      ).as(`ORDERS_${name}_URL`);
    });

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
    cy.intercept("POST", "/api/field/*/dimension").as("fieldDimensionUpdate");
  });

  describe("Name and Description", () => {
    before(restore);

    it("lets you change field name and description", () => {
      visitAlias("@ORDERS_CREATED_AT_URL");

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

  describe("Formatting", () => {
    it("should allow you to change field formatting", () => {
      visitAlias("@ORDERS_QUANTITY_URL");
      cy.findByRole("link", { name: "Formatting" }).click();
      cy.findByLabelText("Style").click();
      popover().findByText("Percent").click();
      cy.wait("@fieldUpdate");
      cy.findByRole("list", { name: "undo-list" })
        .findByText("Updated Quantity")
        .should("exist");
    });
  });

  describe("Visibility", () => {
    before(restore);

    it("lets you change field visibility", () => {
      visitAlias("@ORDERS_CREATED_AT_URL");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Everywhere").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Do not include").click({ force: true });
      cy.wait("@fieldUpdate");

      cy.reload();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Do not include");
    });
  });

  describe("Filtering on this field", () => {
    before(restore);

    it("lets you change to 'Search box'", () => {
      visitAlias("@ORDERS_QUANTITY_URL");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("A list of all values").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Search box").click();
      cy.wait("@fieldUpdate");

      cy.reload();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Search box");
    });
  });

  describe("Display Values", () => {
    before(restore);

    it("lets you change to 'Use foreign key' and change the target for field with fk", () => {
      visitAlias("@ORDERS_PRODUCT_ID_URL");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Use original value").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Use foreign key").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Title").click();
      cy.wait("@fieldDimensionUpdate");

      cy.reload();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Use foreign key");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Title");
    });

    it("allows 'Custom mapping' null values", () => {
      const dbId = 2;
      const remappedNullValue = "nothin";

      restore("withSqlite");
      cy.signInAsAdmin();

      withDatabase(
        dbId,
        ({ NUMBER_WITH_NULLS: { NUM }, NUMBER_WITH_NULLS_ID }) => {
          cy.request("GET", `/api/database/${dbId}/schemas`).then(
            ({ body }) => {
              const [schema] = body;

              cy.visit(
                `/admin/datamodel/database/${dbId}/schema/${dbId}:${schema}/table/${NUMBER_WITH_NULLS_ID}/field/${NUM}/general`,
              );
            },
          );

          cy.log("Change `null` to custom mapping");
          cy.findByRole("heading", { name: "Display values" })
            .closest("section")
            .findByText("Use original value")
            .click();
          popover().findByText("Custom mapping").click();

          cy.findByDisplayValue("null").clear().type(remappedNullValue);
          cy.button("Save").click();
          cy.button("Saved!").should("be.visible");

          cy.log("Make sure custom mapping appears in QB");
          openTable({ database: dbId, table: NUMBER_WITH_NULLS_ID });
          cy.get("[data-testid=cell-data]").should(
            "contain",
            remappedNullValue,
          );
        },
      );
    });
  });
});

describe("Unfold JSON", () => {
  function getUnfoldJsonContent() {
    return cy
      .findByText("Unfold JSON")
      .closest("section")
      .findByTestId("select-button-content");
  }

  beforeEach(() => {
    resetTestTable({ type: "postgres", table: "many_data_types" });
    restore("postgres-writable");
    cy.signInAsAdmin();
    resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "many_data_types" });
  });

  it("lets you enable/disable 'Unfold JSON' for JSON columns", () => {
    cy.intercept("POST", `/api/database/${WRITABLE_DB_ID}/sync_schema`).as(
      "sync_schema",
    );
    // Go to field settings
    cy.visit(`/admin/datamodel/database/${WRITABLE_DB_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Many Data Types/i).click();

    // Check json is unfolded initially
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/json.a/i).should("be.visible");
    cy.findByTestId("column-json").within(() => {
      cy.icon("gear").click();
    });

    getUnfoldJsonContent().findByText(/Yes/i).click();
    popover().within(() => {
      cy.findByText(/No/i).click();
    });

    // Check setting has persisted
    cy.reload();
    getUnfoldJsonContent().findByText(/No/i);

    // Sync database
    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Sync database schema now/i).click();
    cy.wait("@sync_schema");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sync triggered!");

    // Check json field is not unfolded
    cy.visit(`/admin/datamodel/database/${WRITABLE_DB_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Many Data Types/i).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/json.a/i).should("not.exist");
  });
});

describe("scenarios > admin > datamodel > hidden tables (metabase#9759)", () => {
  function hideTable(table) {
    const TABLE_URL = `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${table}`;

    cy.intercept("PUT", `/api/table/${table}`).as("tableUpdate");

    cy.visit(TABLE_URL);
    cy.contains(/^Hidden$/).click();
    cy.wait("@tableUpdate");
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Toggle the table to be hidden as admin user
    hideTable(ORDERS_ID);
  });

  it("hidden table should not show up in various places in UI", () => {
    // Visit the main page, we shouldn't be able to see the table
    cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Products");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Orders").should("not.exist");

    // It shouldn't show up for a normal user either
    cy.signInAsNormalUser();
    cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Products");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Orders").should("not.exist");

    // It shouldn't show in a new question data picker
    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.contains("Products").should("exist");
      cy.contains("Orders").should("not.exist");
    });
  });
});

describe("scenarios > admin > datamodel > metadata", () => {
  function openOptionsForSection(sectionName) {
    cy.findByText(sectionName)
      .closest("section")
      .findByTestId("select-button")
      .click();
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
  });

  it("should remap FK display value from field ", () => {
    cy.wrap(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.PRODUCT_ID}/general`,
    ).as("ORDERS_PRODUCT_ID_URL");

    visitAlias("@ORDERS_PRODUCT_ID_URL");

    cy.findByPlaceholderText("PRODUCT_ID")
      .clear()
      .type("Remapped Product ID")
      .realPress("Tab");

    cy.wait("@fieldUpdate");

    openOrdersTable({ limit: 5 });

    cy.findAllByTestId("header-cell").should("contain", "Remapped Product ID");
  });

  it("should remap FK display value from the table view", () => {
    cy.wrap(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
    ).as("ORDERS_TABLE_URL");

    visitAlias("@ORDERS_TABLE_URL");

    cy.findByDisplayValue("Product ID")
      .clear()
      .type("Remapped Product ID")
      .realPress("Tab");

    cy.wait("@fieldUpdate");

    openOrdersTable({ limit: 5 });

    cy.findAllByTestId("header-cell").should("contain", "Remapped Product ID");
  });

  it("should correctly show remapped column value", () => {
    // go directly to Data Model page for Sample Database
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    // edit "Product ID" column in "Orders" table
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
    cy.findByTestId("column-PRODUCT_ID").find(".Icon-gear").click();

    // remap its original value to use foreign key
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Use original value").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Use foreign key").click();
    popover().within(() => {
      cy.findByText("Title").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
    );

    cy.log("Name of the product should be displayed instead of its ID");
    openOrdersTable();
    cy.findAllByText("Awesome Concrete Shoes");
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

    // go directly to Data Model page for Sample Database
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    // edit "Rating" values in "Reviews" table
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Reviews").click();
    cy.findByTestId("column-RATING").find(".Icon-gear").click();

    // apply custom remapping for "Rating" values 1-5
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Use original value").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom mapping").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
    );

    Object.entries(customMap).forEach(([key, value]) => {
      cy.findByDisplayValue(key).click().clear().type(value);
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.log("Numeric ratings should be remapped to custom strings");
    openReviewsTable();
    Object.values(customMap).forEach(rating => {
      cy.findAllByText(rating);
    });
  });

  it("should not include date when metric is binned by hour of day (metabase#14124)", () => {
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });

    cy.createQuestion(
      {
        name: "14124",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
          ],
        },
      },
      { visitQuestion: true },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At: Hour of day");

    cy.log("Reported failing in v0.37.2");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^3:00 AM$/);
  });

  it("should not display multiple 'Created At' fields when they are remapped to PK/FK (metabase#15563)", () => {
    // Remap fields
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: "type/PK",
    });
    cy.request("PUT", `/api/field/${REVIEWS.CREATED_AT}`, {
      semantic_type: "type/FK",
      fk_target_field_id: ORDERS.CREATED_AT,
    });

    openReviewsTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    cy.get("[data-element-id=list-section-header]")
      .contains("Created At")
      .click();
    cy.get("[data-element-id=list-section] [data-element-id=list-item-title]")
      .contains("Created At")
      .should("have.length", 1);
  });

  it("should display breakouts group for all FKs (metabase#36122)", () => {
    cy.request("PUT", `/api/field/${REVIEWS.RATING}`, {
      semantic_type: "type/FK",
      fk_target_field_id: PRODUCTS.ID,
    });

    openReviewsTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();

    popover().within(() => {
      cy.findAllByTestId("dimension-list-item")
        .eq(3)
        .should("have.text", "Rating");
      cy.get("[data-element-id=list-section-header]").should("have.length", 3);
      cy.get("[data-element-id=list-section-header]")
        .eq(0)
        .should("have.text", "Reviews");
      cy.get("[data-element-id=list-section-header]")
        .eq(1)
        .should("have.text", "Product");
      cy.get("[data-element-id=list-section-header]")
        .eq(2)
        .should("have.text", "Rating");
    });
  });

  it("display value 'custom mapping' should be available regardless of the chosen filtering type (metabase#16322)", () => {
    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${REVIEWS_ID}/field/${REVIEWS.RATING}/general`,
    );

    openOptionsForSection("Filtering on this field");
    popover().findByText("Search box").click();

    openOptionsForSection("Display values");
    popover().findByText("Custom mapping").should("not.exist");

    openOptionsForSection("Filtering on this field");
    popover().findByText("A list of all values").click();

    openOptionsForSection("Display values");
    popover().findByText("Custom mapping");
  });

  describe("column formatting options", () => {
    beforeEach(() => {
      cy.intercept("PUT", "/api/field/*").as("updateField");
      cy.intercept("GET", "/api/field/*").as("getField");
    });

    it("should only show currency formatting options for currency fields", () => {
      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.DISCOUNT}/formatting`,
      );

      cy.wait("@getField");

      cy.findByTestId("column-settings").within(() => {
        cy.findByText("Unit of currency");
        cy.findByText("Currency label style");
      });

      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.QUANTITY}/formatting`,
      );

      cy.wait("@getField");

      cy.findByTestId("column-settings").within(() => {
        // shouldnt show currency settings by default for quantity field
        cy.findByText("Unit of currency").should("not.be.visible");
        cy.findByText("Currency label style").should("not.be.visible");

        cy.get("#number_style").click();
      });

      // if you change the style to currency, currency settings should appear
      popover().findByText("Currency").click();
      cy.wait("@updateField");

      cy.findByTestId("column-settings").within(() => {
        cy.findByText("Unit of currency");
        cy.findByText("Currency label style");
      });
    });

    it("should save and obey field prefix formatting settings", () => {
      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.QUANTITY}/formatting`,
      );

      cy.wait("@getField");

      cy.findByTestId("column-settings").within(() => {
        cy.findByTestId("prefix").type("about ").blur();
      });

      cy.wait("@updateField");

      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["sum", ["field", ORDERS.QUANTITY, null]]],
          },
          type: "query",
        },
      });

      cy.findByTestId("visualization-root").findByText("about 69,540");
    });
  });
});

describe("scenarios > admin > datamodel > segments", () => {
  beforeEach(() => {
    restore();
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

      cy.findByTestId("gui-builder").findByText("Select a table").click();
      popover().findByText("Orders").click();

      cy.findByTestId("gui-builder")
        .findByText("Add filters to narrow your answer")
        .click();

      cy.log("Fails in v0.36.0 and v0.36.3. It exists in v0.35.4");
      popover().findByText("Custom Expression");
    });

    it("should show no segments", () => {
      cy.visit("/reference/segments");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Segments are interesting subsets of tables");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Learn how to create segments");
    });
  });

  describe("with segment", () => {
    const SEGMENT_NAME = "Orders < 100";

    beforeEach(() => {
      // Create a segment through API
      createSegment({
        name: SEGMENT_NAME,
        description: "All orders with a total under $100.",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });
    });

    it("should show the segment fields list and detail view", () => {
      // In the list
      cy.visit("/reference/segments");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(SEGMENT_NAME);

      // Detail view
      cy.visit("/reference/segments/1");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Description");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("See this segment");

      // Segment fields
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Fields in this segment").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("See this segment").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`Fields in ${SEGMENT_NAME}`);
      cy.findAllByText("Discount");
    });

    it("should show up in UI list", () => {
      cy.visit("/admin/datamodel/segments");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(SEGMENT_NAME);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Filtered by Total");
    });

    it("should show the segment details of a specific id", () => {
      cy.visit("/admin/datamodel/segment/1");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit Your Segment");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Preview");
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

      summarize();
      cy.findAllByTestId("sidebar-right").button("Done").click();
      cy.findByTestId("scalar-value").should("have.text", "13,005");
      cy.wait(2000);
      saveQuestion("Foo");
      cy.wait(2000);

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
      cy.get("label").contains("Segments").click();

      cy.findByTestId("segment-list-app")
        .contains(SEGMENT_NAME)
        .parent()
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      popover().contains("Edit Segment").click();

      // update the filter from "< 100" to "> 10"
      cy.url().should("match", /segment\/1$/);
      cy.get("label").contains("Edit Your Segment");
      cy.findByTestId("filter-widget-target")
        .contains(/Total\s+is less than/)
        .click();
      popover().findByTestId("operator-select").click();
      popover().contains("Greater than").click();
      popover()
        .findByTestId("field-values-widget")
        .find("input")
        .type("{SelectAll}10");
      popover().contains("Update filter").click();

      // confirm that the preview updated
      cy.findByTestId("gui-builder").contains("18758 rows");

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
      popover().findByText("Retire Segment").click();
      modal().find("textarea").type("delete it");
      modal().contains("button", "Retire").click();
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
      popover().findByTextEnsureVisible("Revision History").click();

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
        cy.get("@revisions")
          .last()
          .should("contain", `You created "${SEGMENT_NAME}"`)
          .and("contain", "All orders with a total under $100.");
      }
    });
  });
});

describe("scenarios > admin > databases > table", () => {
  function turnTableVisibilityOff(table_id) {
    cy.request("PUT", "/api/table", {
      ids: [table_id],
      visibility_type: "hidden",
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should see 8 tables in sample database", () => {
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    cy.findAllByTestId("admin-metadata-table-list-item").should(
      "have.length",
      8,
    );
  });

  it("should be able to see details of each table", () => {
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Select any table to see its schema and add or edit metadata.",
    );

    // Orders
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Select any table to see its schema and add or edit metadata.",
    ).should("not.exist");
    cy.get(
      "input[value='Confirmed Sample Company orders for a product, from a user.']",
    );
  });

  it("should show 404 if database does not exist (metabase#14652)", () => {
    cy.visit("/admin/datamodel/database/54321");
    cy.findAllByTestId("admin-metadata-table-list-item").should(
      "have.length",
      0,
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not found.");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a database");
  });

  describe("in orders table", () => {
    beforeEach(() => {
      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
      );
    });

    it("should see multiple fields", () => {
      cy.get("input[value='User ID']");
      cy.findAllByText("Foreign Key");

      cy.get("input[value='Tax']");
      cy.findAllByText("No semantic type");

      cy.get("input[value='Discount']");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Discount");
    });

    it("should see the id field", () => {
      cy.get("input[value='ID']");
      cy.findAllByText("Entity Key");
    });

    it("should see the created_at timestamp field", () => {
      cy.get("input[value='Created At']");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Creation timestamp");
    });
  });

  describe.skip("turning table visibility off shouldn't prevent editing related question (metabase#15947)", () => {
    it("simple question (metabase#15947-1)", () => {
      turnTableVisibilityOff(ORDERS_ID);
      visitQuestion(ORDERS_QUESTION_ID);
      filter();
    });

    it("question with joins (metabase#15947-2)", () => {
      cy.createQuestion({
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
      });
    });
  });
});
