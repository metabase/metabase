import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { TableId } from "metabase-types/api";

const { H } = cy;
const { TablePicker, TableSection, FieldSection } = H.DataModel;
const { ORDERS, ORDERS_ID, PRODUCTS, REVIEWS, REVIEWS_ID, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > admin > datamodel", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
    cy.intercept("PUT", "/api/field/*", cy.spy().as("updateFieldSpy")).as(
      "updateField",
    );
    cy.intercept("POST", "/api/field/*/values").as("fieldValuesUpdate");
    cy.intercept("POST", "/api/field/*/dimension").as("fieldDimensionUpdate");
    cy.intercept("PUT", "/api/table/*").as("tableUpdate");
  });

  describe("Table picker", () => {
    describe("no databases", () => {
      beforeEach(() => {
        cy.request("DELETE", `/api/database/${SAMPLE_DB_ID}`);
      });

      // TODO: https://linear.app/metabase/issue/SEM-459/empty-state-when-there-are-no-databases
      it.skip("should allow to navigate databases, schemas, and tables", () => {
        H.DataModel.visit();
      });
    });

    describe("1 database, 1 schema", () => {
      it("should allow to navigate databases, schemas, and tables", () => {
        H.DataModel.visit();

        cy.log("should auto-open the only schema in the only database");
        cy.location("pathname").should(
          "eq",
          `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}`,
        );
        verifyTableSectionEmptyState();
        TablePicker.getDatabases().should("have.length", 1);
        TablePicker.getDatabase("Sample Database").should("be.visible");
        TablePicker.getSchemas().should("have.length", 0);
        TablePicker.getTables().should("have.length", 8);
        TableSection.get().should("not.exist");
        TablePicker.getTable("Orders").should("be.visible").click();

        cy.location("pathname").should(
          "eq",
          `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
        );
        TableSection.get().should("be.visible");
        verifyFieldSectionEmptyState();

        TablePicker.getTable("Products").should("be.visible").click();
        cy.location("pathname").should(
          "eq",
          `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PRODUCTS_ID}`,
        );
        TableSection.get().should("be.visible");
        verifyFieldSectionEmptyState();
      });

      it("should allow to search for tables", () => {
        H.DataModel.visit();

        TablePicker.getSearchInput().type("or");
        TablePicker.getDatabases().should("have.length", 1);
        TablePicker.getSchemas().should("have.length", 1);
        TablePicker.getTables().should("have.length", 2);
        TablePicker.getTable("Orders").should("be.visible").click();
        cy.location("pathname").should(
          "eq",
          `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
        );
        TableSection.getNameInput().should("have.value", "Orders");

        cy.log("no results");
        TablePicker.getSearchInput().clear().type("xyz");
        TablePicker.get().findByText("No results.").should("be.visible");

        cy.log("go back to browsing");
        TablePicker.getSearchInput().clear();
        TablePicker.getDatabases().should("have.length", 1);
        TablePicker.getSchemas().should("have.length", 0);
        TablePicker.getTables().should("have.length", 8);
      });
    });

    describe(
      "mutliple databases, with single and multiple schemas",
      { tags: "@external" },
      () => {
        beforeEach(() => {
          H.restore("postgres-writable");
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });
        });

        it("should allow to navigate databases, schemas, and tables", () => {
          H.DataModel.visit();

          cy.location("pathname").should("eq", "/admin/datamodel/database");
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 0);
          TablePicker.getTables().should("have.length", 0);
          TablePicker.getDatabase("Sample Database").should("be.visible");

          cy.log("open database");
          TablePicker.getDatabase("Writable Postgres12")
            .should("be.visible")
            .click();
          cy.location("pathname").should(
            "eq",
            `/admin/datamodel/database/${WRITABLE_DB_ID}`,
          );
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 0);
          TablePicker.getSchema("Wild").should("be.visible");
          TablePicker.getSchema("Domestic").should("be.visible");

          cy.log("open schema");
          TablePicker.getSchema("Domestic").click();
          cy.location("pathname").should(
            "eq",
            `/admin/datamodel/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic`,
          );
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 1);
          TablePicker.getTable("Animals").should("be.visible");

          cy.log("open table");
          TablePicker.getTable("Animals").click();
          cy.location("pathname").should((pathname) => {
            return pathname.startsWith(
              `/admin/datamodel/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/`,
            );
          });
          TableSection.getNameInput().should("have.value", "Animals");

          cy.log("open another schema");
          TablePicker.getSchema("Wild").click();
          cy.location("pathname").should(
            "eq",
            `/admin/datamodel/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Wild`,
          );
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 3);
          TablePicker.getTable("Birds").should("be.visible");

          cy.log("open another table");
          TablePicker.getTable("Birds").click();
          cy.location("pathname").should((pathname) => {
            return pathname.startsWith(
              `/admin/datamodel/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/`,
            );
          });
          TableSection.getNameInput().should("have.value", "Birds");

          cy.log("close schema");
          TablePicker.getSchema("Wild").click();
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 1);
          TablePicker.getTable("Birds").should("not.exist");

          cy.log("close database");
          TablePicker.getDatabase("Writable Postgres12").click();
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 0);
          TablePicker.getTables().should("have.length", 0);
        });

        it("should allow to search for tables", () => {
          H.DataModel.visit();

          TablePicker.getSearchInput().type("rd");
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 2);
          TablePicker.getTable("Orders").should("be.visible");
          TablePicker.getTable("Birds").should("be.visible");

          TablePicker.getSearchInput().clear().type("rds");
          TablePicker.getDatabases().should("have.length", 1);
          TablePicker.getSchemas().should("have.length", 1);
          TablePicker.getTables().should("have.length", 1);
          TablePicker.getTable("Birds").should("be.visible").click();

          cy.location("pathname").should((pathname) => {
            return pathname.startsWith(
              `/admin/datamodel/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Wild/table/`,
            );
          });
          TableSection.getNameInput().should("have.value", "Birds");

          cy.log("go back to browsing");
          TablePicker.getSearchInput().clear();
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 2);
        });
      },
    );
  });

  describe("Table section", () => {
    it("should show all tables in sample database and fields in orders table", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      TablePicker.getTables().should("have.length", 8);

      TableSection.clickField("ID");
      FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "BIGINT");
      FieldSection.getSemanticTypeInput().should("have.value", "Entity Key");

      TableSection.clickField("User ID");
      FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "INTEGER");
      FieldSection.getSemanticTypeInput().should("have.value", "Foreign Key");
      FieldSection.getSemanticTypeFkTarget().should(
        "have.value",
        "People → ID",
      );

      TableSection.clickField("Tax");
      FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "DOUBLE PRECISION");
      FieldSection.getSemanticTypeInput().should(
        "have.value",
        "No semantic type",
      );

      TableSection.clickField("Discount");
      FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "DOUBLE PRECISION");
      FieldSection.getSemanticTypeInput().should("have.value", "Discount");

      TableSection.clickField("Created At");
      FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "TIMESTAMP");
      FieldSection.getSemanticTypeInput().should(
        "have.value",
        "Creation timestamp",
      );
    });

    it("should allow to change name and description of the table", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      verifyFieldSectionEmptyState();

      cy.log("name");
      TableSection.getNameInput()
        .should("have.value", "Orders")
        .clear()
        .type("New orders")
        .blur();
      H.undoToast().should("contain.text", "Table name updated");
      H.undoToast().icon("close").click();
      TablePicker.getTable("New orders").should("be.visible");

      cy.log("description");
      TableSection.getDescriptionInput()
        .should(
          "have.value",
          "Confirmed Sample Company orders for a product, from a user.",
        )
        .clear()
        .type("New description")
        .blur();
      H.undoToast().should("contain.text", "Table description updated");

      cy.reload();
      TableSection.getNameInput().should("have.value", "New orders");
      TableSection.getDescriptionInput().should(
        "have.value",
        "New description",
      );
    });

    it("should remap FK display value from the table section", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      TableSection.getFieldNameInput("Product ID")
        .clear()
        .type("Remapped Product ID")
        .realPress("Tab");
      cy.wait("@updateField");

      H.openOrdersTable({ limit: 5 });
      cy.findAllByTestId("header-cell").should(
        "contain",
        "Remapped Product ID",
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

    it("hidden table should not show up in various places in UI", () => {
      cy.signInAsAdmin();

      // Toggle the orders table to be hidden as admin user
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });
      TablePicker.getTable("Orders").button("Hide table").click();
      cy.wait("@tableUpdate");

      // Visit the main page, we shouldn't be able to see the table
      cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);

      cy.findByTestId("browse-schemas")
        .findByText("Products")
        .should("be.visible");
      cy.findByTestId("browse-schemas")
        .findByText("Orders")
        .should("not.exist");

      // It shouldn't show up for a normal user either
      cy.signInAsNormalUser();
      cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);

      cy.findByTestId("browse-schemas")
        .findByText("Products")
        .should("be.visible");
      cy.findByTestId("browse-schemas")
        .findByText("Orders")
        .should("not.exist");

      // It shouldn't show in a new question data picker
      H.startNewQuestion();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.contains("Products").should("exist");
        cy.contains("Orders").should("not.exist");
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
              [
                ">",
                ["field", PRODUCTS.RATING, { "join-alias": "Products" }],
                3,
              ],
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
    });
  });

  describe("Field section", () => {
    describe("Header", () => {
      it("should let you change field name and description", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.CREATED_AT,
        });

        // update the name
        FieldSection.getNameInput()
          .should("have.value", "Created At")
          .clear()
          .type("new display_name")
          .blur();
        cy.wait("@updateField");

        // update the description
        FieldSection.getDescriptionInput()
          .should("have.value", "The date and time an order was submitted.")
          .clear()
          .type("new description")
          .blur();
        cy.wait("@updateField");

        // reload and verify they have been updated
        cy.reload();
        FieldSection.getNameInput().should("have.value", "new display_name");
        FieldSection.getDescriptionInput().should(
          "have.value",
          "new description",
        );
      });

      it("should remap FK display value from field section", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        FieldSection.getNameInput()
          .clear()
          .type("Remapped Product ID")
          .realPress("Tab");
        cy.wait("@updateField");

        H.openOrdersTable({ limit: 5 });
        cy.findAllByTestId("header-cell").should(
          "contain",
          "Remapped Product ID",
        );
      });
    });

    describe("Metadata", () => {
      describe("Semantic type", () => {
        it("should let you change the type to 'No semantic type'", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.PRODUCT_ID,
          });
          cy.wait(["@metadata", "@metadata"]);

          FieldSection.getSemanticTypeInput()
            .should("have.value", "Foreign Key")
            .click();
          H.popover().findByText("No semantic type").click();

          waitAndAssertOnResponse("updateField");

          cy.reload();
          cy.wait("@metadata");

          FieldSection.getSemanticTypeInput().should(
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

          FieldSection.getSemanticTypeInput()
            .should("have.value", "Quantity")
            .click();
          H.popover().findByText("Foreign Key").click();
          waitAndAssertOnResponse("updateField");

          FieldSection.getSemanticTypeFkTarget().click();
          H.popover().findByText("Products → ID").click();
          waitAndAssertOnResponse("updateField");

          cy.reload();
          cy.wait(["@metadata", "@metadata"]);

          FieldSection.getSemanticTypeFkTarget()
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

          FieldSection.getSemanticTypeFkTarget().focus().clear();
          H.popover()
            .should("contain.text", "Orders → ID")
            .and("contain.text", "People → ID")
            .and("contain.text", "Products → ID")
            .and("contain.text", "Reviews → ID");

          cy.log("should case-insensitive match field display name");
          FieldSection.getSemanticTypeFkTarget().focus().type("id");
          H.popover()
            .should("contain.text", "Orders → ID")
            .and("contain.text", "People → ID")
            .and("contain.text", "Products → ID")
            .and("contain.text", "Reviews → ID");

          cy.log("should case-insensitive match field description");
          FieldSection.getSemanticTypeFkTarget().focus().clear().type("EXT");
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

          FieldSection.getSemanticTypeInput().click();
          H.popover()
            .should("contain.text", "Foreign Key")
            .and("not.contain.text", "Number");
        });

        it("semantic picker should not overflow the screen on smaller viewports (metabase#56442)", () => {
          const viewportHeight = 400;

          cy.viewport(1280, viewportHeight);
          H.DataModel.visit({ databaseId: SAMPLE_DB_ID });
          TablePicker.getTable("Reviews").scrollIntoView().click();
          TableSection.clickField("ID");
          FieldSection.getSemanticTypeInput().click();

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
      });
    });

    describe("Behavior", () => {
      describe("Visibility", () => {
        it("should let you change field visibility", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.CREATED_AT,
          });

          FieldSection.getVisibilityInput().click();
          H.popover().findByText("Do not include").click();
          cy.wait("@updateField");

          cy.reload();
          FieldSection.getVisibilityInput()
            .scrollIntoView()
            .should("be.visible")
            .and("have.value", "Do not include");
        });
      });

      describe("Filtering", () => {
        it("should let you change to 'Search box'", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.QUANTITY,
          });

          FieldSection.getFilteringInput().click();
          H.popover().findByText("Search box").click();
          cy.wait("@updateField");

          cy.reload();
          FieldSection.getFilteringInput()
            .scrollIntoView()
            .should("be.visible")
            .and("have.value", "Search box");
        });
      });

      describe("Display values", () => {
        it("should let you change to 'Use foreign key' and change the target for field with fk", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.PRODUCT_ID,
          });

          FieldSection.getDisplayValuesInput().click();
          H.popover().findByText("Use foreign key").click();
          H.popover().findByText("Title").click();
          cy.wait("@fieldDimensionUpdate");

          cy.reload();
          FieldSection.getDisplayValuesInput()
            .scrollIntoView()
            .should("be.visible")
            .and("have.value", "Use foreign key");
          FieldSection.getDisplayValuesFkTargetInput()
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
              FieldSection.getDisplayValuesInput().scrollIntoView().click();
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
              H.openTable({
                database: databaseId,
                table: NUMBER_WITH_NULLS_ID,
              });
              cy.findAllByRole("gridcell", { name: remappedNullValue }).should(
                "be.visible",
              );
            },
          );
        });

        it("should correctly show remapped column value", () => {
          H.DataModel.visit({ databaseId: SAMPLE_DB_ID });

          // edit "Product ID" column in "Orders" table
          TablePicker.getTable("Orders").click();
          TableSection.clickField("Product ID");

          // remap its original value to use foreign key
          FieldSection.getDisplayValuesInput().click();
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
          TablePicker.getTable("Reviews").click();
          TableSection.clickField("Rating");

          // apply custom remapping for "Rating" values 1-5
          FieldSection.getDisplayValuesInput().click();
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
            cy.findAllByText(rating)
              .eq(0)
              .scrollIntoView()
              .should("be.visible");
          });
        });

        it("display value 'Custom mapping' should be available only for 'Search box' filtering type (metabase#16322)", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });

          FieldSection.getFilteringInput().click();
          H.popover().findByText("Search box").click();
          cy.wait("@updateField");

          FieldSection.getDisplayValuesInput().click();
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

          FieldSection.getFilteringInput().click();
          H.popover().findByText("A list of all values").click();

          FieldSection.getDisplayValuesInput().click();
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

          FieldSection.getDisplayValuesInput().click();
          H.popover().findByText("Use foreign key").click();
          FieldSection.getDisplayValuesFkTargetInput().click();

          H.popover().within(() => {
            cy.findByText("Birth Date").scrollIntoView().should("be.visible");
            cy.findByText("Created At")
              .scrollIntoView()
              .should("be.visible")
              .click();
          });
          cy.wait("@fieldDimensionUpdate");

          H.visitQuestion(ORDERS_QUESTION_ID);
          cy.findAllByTestId("cell-data")
            .eq(10) // 1st data row, 2nd column (User ID)
            .should("have.text", "2023-10-07T01:34:35.462-07:00");
        });
      });

      describe("Unfold JSON", { tags: "@external" }, () => {
        beforeEach(() => {
          H.restore("postgres-writable");
          H.resetTestTable({ type: "postgres", table: "many_data_types" });
          cy.signInAsAdmin();
          H.resyncDatabase({
            dbId: WRITABLE_DB_ID,
            tableName: "many_data_types",
          });
          cy.intercept(
            "POST",
            `/api/database/${WRITABLE_DB_ID}/sync_schema`,
          ).as("sync_schema");
        });

        it("should let you enable/disable 'Unfold JSON' for JSON columns", () => {
          // Go to field settings
          H.DataModel.visit({ databaseId: WRITABLE_DB_ID });
          TablePicker.getTable("Many Data Types").click();

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
          TablePicker.getTable("Many Data Types").click();
          cy.findByLabelText("Json → A").should("not.exist");
        });
      });
    });

    describe("Formatting", () => {
      it("should let you to change field formatting", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.QUANTITY,
        });

        FieldSection.getStyleInput().click();
        H.popover().findByText("Percent").click();
        cy.wait("@updateField");

        H.undoToast().should(
          "contain.text",
          "Field formatting for Quantity updated",
        );
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

        FieldSection.getPrefixInput().scrollIntoView().type("about ").blur();
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

        FieldSection.getPrefixInput().focus().blur();
        cy.get("@updateFieldSpy").should("not.have.been.called");
        H.undoToast().should("not.exist");

        FieldSection.getSuffixInput().focus().blur();
        cy.get("@updateFieldSpy").should("not.have.been.called");
        H.undoToast().should("not.exist");
      });
    });
  });
});

function waitAndAssertOnResponse(alias: string) {
  cy.wait("@" + alias).then((request) => {
    expect(request.response?.body.errors).to.not.exist;
  });
}

function turnTableVisibilityOff(tableId: TableId) {
  cy.request("PUT", "/api/table", {
    ids: [tableId],
    visibility_type: "hidden",
  });
}

function verifyTableSectionEmptyState() {
  cy.get("main")
    .findByText("Start by selecting data to model")
    .should("be.visible");
  cy.get("main")
    .findByText("Browse your databases to find the table you’d like to edit.")
    .should("be.visible");
}

function verifyFieldSectionEmptyState() {
  cy.get("main").findByText("Edit the table and fields").should("be.visible");
  cy.get("main")
    .findByText(
      "Select a field to edit it. Then change the display name, semantic type or filtering behavior.",
    )
    .should("be.visible");
}
