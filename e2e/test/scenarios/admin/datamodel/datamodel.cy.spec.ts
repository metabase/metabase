import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

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
    cy.visit(`/admin/datamodel/database/${WRITABLE_DB_ID}`);
    getTable("Many Data Types").click();

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
    getTable("Many Data Types").click();
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
    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
    );
    getTable("Orders").button("Hide table").click();
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
    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.PRODUCT_ID}/general`,
    );

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
    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
    );

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
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);

    // edit "Product ID" column in "Orders" table
    getTable("Orders").click();
    getField("Product ID").click();

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

    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    // edit "Rating" values in "Reviews" table
    getTable("Reviews").click();
    getField("Rating").click();

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
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    getTable("Reviews").scrollIntoView().click();
    getField("ID").scrollIntoView().click();
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
    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${REVIEWS_ID}/field/${REVIEWS.RATING}/general`,
    );

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
    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.USER_ID}/general`,
    );
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
      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.DISCOUNT}/formatting`,
      );
      cy.wait("@metadata");

      cy.findByTestId("column-settings")
        .scrollIntoView()
        .within(() => {
          cy.findByText("Unit of currency").should("be.visible");
          cy.findByText("Currency label style").should("be.visible");
        });

      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.QUANTITY}/formatting`,
      );
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
      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.QUANTITY}/formatting`,
      );

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
      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.QUANTITY}/formatting`,
      );
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

function getTable(name: string) {
  return cy.findAllByTestId("tree-item").filter(`:contains("${name}")`);
}

function getField(name: string) {
  return cy.findByTestId("table-section").get(`a[aria-label="${name}"]`);
}
