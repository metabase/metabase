import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { TableId } from "metabase-types/api";

const { H } = cy;
const {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  REVIEWS,
  REVIEWS_ID,
  PRODUCTS_ID,
} = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;
const { FieldSection, PreviewSection, TablePicker, TableSection } = H.DataModel;

const CUSTOM_MAPPING_ERROR =
  "You need unrestricted data access on this table to map custom display values.";

describe("scenarios > admin > datamodel", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept({ method: "GET", pathname: "/api/database" }).as("databases");
    cy.intercept("GET", "/api/database/*/schemas?*").as("schemas");
    cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
    cy.intercept("GET", "/api/database/*/schema/*").as("schema");
    cy.intercept("POST", "/api/dataset*").as("dataset");
    cy.intercept("GET", "/api/field/*/values").as("fieldValues");
    cy.intercept("PUT", "/api/field/*", cy.spy().as("updateFieldSpy")).as(
      "updateField",
    );
    cy.intercept("PUT", "/api/table/*/fields/order").as("updateFieldOrder");
    cy.intercept("POST", "/api/field/*/values").as("updateFieldValues");
    cy.intercept("POST", "/api/field/*/dimension").as("updateFieldDimension");
    cy.intercept("PUT", "/api/table/*").as("updateTable");
  });

  describe("Table picker", () => {
    describe("1 database, 1 schema", () => {
      it("should allow to search for tables", () => {
        H.DataModel.visit();

        TablePicker.getSearchInput().type("or");
        TablePicker.getTable("Orders").should("be.visible").click();
        cy.location("pathname").should(
          "eq",
          `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
        );
        TableSection.getNameInput().should("have.value", "Orders");
      });
    });

    describe("Table visibility", () => {
      it("should allow changing the table visibility and not prevent editing related question after turning table visibility off (metabase#15947)", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TablePicker.getTable("Orders").button("Hide table").click();
        cy.wait("@updateTable");

        verifyAndCloseToast("Hid Orders");

        H.startNewQuestion();
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("People").should("be.visible");
          cy.findByText("Orders").should("not.exist");
        });

        cy.log(
          "shouldn't prevent editing related question after turning table visibility off - simple question (metabase#15947-1)",
        );
        H.visitQuestion(ORDERS_QUESTION_ID);
        H.queryBuilderHeader().findByText("View-only").should("be.visible");

        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TablePicker.getTable("Orders").button("Unhide table").click();
        cy.wait("@updateTable");

        verifyAndCloseToast("Unhid Orders");

        H.startNewQuestion();
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("People").should("be.visible");
          cy.findByText("Orders").should("be.visible");
        });
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
        cy.wait("@updateTable");

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
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.contains("Products").should("exist");
          cy.contains("Orders").should("not.exist");
        });
      });
    });
  });

  describe("Table section", () => {
    describe("Name and description", () => {
      it("should allow changing the table name with data model permissions only", () => {
        H.activateToken("pro-self-hosted");
        setDataModelPermissions({ tableIds: [ORDERS_ID] });

        cy.signIn("none");
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getNameInput().clear().type("New orders").blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table name updated");
        TableSection.getNameInput().should("have.value", "New orders");
        cy.signOut();

        cy.signInAsNormalUser();
        H.startNewQuestion();
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("People").should("be.visible");
          cy.findByText("New orders").should("be.visible");
        });
      });
    });

    describe("Field name and description", () => {
      it("should allow changing the field name with data model permissions only", () => {
        H.activateToken("pro-self-hosted");
        setDataModelPermissions({ tableIds: [ORDERS_ID] });
        cy.signIn("none");
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getFieldNameInput("Tax").clear().type("New tax").blur();
        cy.wait("@updateField");
        verifyAndCloseToast("Name of Tax updated");
        TableSection.getFieldNameInput("New tax").should("be.visible");
        TableSection.getField("New tax").should("be.visible");

        cy.log("verify preview");
        TableSection.clickField("New tax");
        FieldSection.getPreviewButton().click();
        cy.wait("@dataset");
        PreviewSection.get()
          .findByText("Sorry, you don’t have permission to see that.")
          .should("be.visible");
        PreviewSection.getPreviewTypeInput().findByText("Detail").click();
        cy.wait("@dataset");
        PreviewSection.get()
          .findByText("Sorry, you don’t have permission to see that.")
          .should("be.visible");

        cy.log("verify viz as normal user");
        cy.signInAsNormalUser();
        H.openOrdersTable();
        H.tableHeaderColumn("New tax").should("be.visible");
        H.tableHeaderColumn("Tax", { scrollIntoView: false }).should(
          "not.exist",
        );
      });

      it("should allow clearing the field description", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getFieldDescriptionInput("Total").clear().blur();
        cy.wait("@updateField");
        verifyAndCloseToast("Description of Total updated");
        TableSection.getFieldDescriptionInput("Total").should("have.value", "");

        cy.log("verify preview");
        TableSection.clickField("Total");
        FieldSection.getPreviewButton().click();
        verifyTablePreview({
          column: "Total",
          values: ["39.72", "117.03", "49.21", "115.23", "134.91"],
        });
        PreviewSection.get().findByTestId("header-cell").realHover();
        H.hovercard().should("not.contain.text", "The total billed amount.");

        cy.visit(
          `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
        );
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Total").should("be.visible");
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("No description yet").should("be.visible");
      });
    });

    describe("Sorting", () => {
      it("should allow sorting fields in a custom order and switching back to predefined order (metabase#56482)", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.getSortButton().click();
        TableSection.getSortOrderInput()
          .findByDisplayValue("database")
          .should("be.checked");

        TableSection.getSortableField("ID").as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", {
          vertical: 50,
        });
        cy.wait("@updateFieldOrder");
        verifyAndCloseToast("Field order updated");

        cy.log(
          "should not show loading state after an update (metabase#56482)",
        );
        cy.findByTestId("loading-indicator", { timeout: 0 }).should(
          "not.exist",
        );

        TableSection.getSortableFields().should(($items) => {
          expect($items[0].textContent).to.equal("Ean");
          expect($items[1].textContent).to.equal("ID");
        });

        TableSection.getSortOrderInput()
          .findByDisplayValue("custom")
          .should("be.checked");

        cy.log(
          "should allow switching to predefined order afterwards (metabase#56482)",
        );
        TableSection.getSortOrderInput()
          .findByLabelText("Database order")
          .click();
        cy.wait("@updateTable");

        TableSection.getSortOrderInput()
          .findByDisplayValue("database")
          .should("be.checked");
        TableSection.getSortableFields().should(($items) => {
          expect($items[0].textContent).to.equal("ID");
          expect($items[1].textContent).to.equal("Ean");
        });

        cy.log("should allow drag & drop afterwards (metabase#56482)"); // extra sanity check
        TableSection.getSortableField("ID").as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", {
          vertical: 50,
        });
        cy.wait("@updateFieldOrder");

        cy.log(
          "should not show loading state after an update (metabase#56482)",
        );
        cy.findByTestId("loading-indicator", { timeout: 0 }).should(
          "not.exist",
        );

        TableSection.getSortableFields().should(($items) => {
          expect($items[0].textContent).to.equal("Ean");
          expect($items[1].textContent).to.equal("ID");
        });

        cy.log("custom order is applied in the query builder");
        H.openProductsTable();
        H.assertTableData({
          columns: [
            "Ean",
            "ID",
            "Title",
            "Category",
            "Vendor",
            "Price",
            "Rating",
            "Created At",
          ],
        });
      });
    });

    describe("Sync options", () => {
      it("should allow to sync table schema, re-scan table, and discard cached field values", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });
        TableSection.getSyncOptionsButton().click();

        cy.log("sync table schema");
        H.modal().within(() => {
          cy.button("Sync table schema").click();
          cy.button("Sync table schema").should("not.exist");
          cy.button("Sync triggered!").should("be.visible");
          cy.button("Sync triggered!").should("not.exist");
          cy.button("Sync table schema").should("be.visible");
        });

        cy.log("re-scan table");
        H.modal().within(() => {
          cy.button("Re-scan table").click();
          cy.button("Re-scan table").should("not.exist");
          cy.button("Scan triggered!").should("be.visible");
          cy.button("Scan triggered!").should("not.exist");
          cy.button("Re-scan table").should("be.visible");
        });

        cy.log("discard cached field values");
        H.modal().within(() => {
          cy.button("Discard cached field values").click();
          cy.button("Discard cached field values").should("not.exist");
          cy.button("Discard triggered!").should("be.visible");
          cy.button("Discard triggered!").should("not.exist");
          cy.button("Discard cached field values").should("be.visible");
        });

        cy.realPress("Escape");
        H.modal().should("not.exist");
      });
    });
  });

  describe("Field section", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    describe("Metadata", () => {
      describe("Semantic type", () => {
        it("should allow to change the field foreign key target with no permissions to Reviews table", () => {
          H.activateToken("pro-self-hosted");
          setDataModelPermissions({
            tableIds: [ORDERS_ID, PRODUCTS_ID, PEOPLE_ID],
          });

          cy.signIn("none");
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.USER_ID,
          });
          FieldSection.getSemanticTypeFkTarget()
            .should("have.value", "People → ID")
            .click();
          H.popover().within(() => {
            cy.findByText("Reviews → ID").should("not.exist");
            cy.findByText("Products → ID").click();
          });
          cy.wait("@updateField");
          H.undoToast().should(
            "contain.text",
            "Semantic type of User ID updated",
          );
          FieldSection.getSemanticTypeFkTarget().should(
            "have.value",
            "Products → ID",
          );

          cy.log("verify preview");
          FieldSection.getPreviewButton().click();
          cy.wait("@dataset");
          PreviewSection.get()
            .findByText("Sorry, you don’t have permission to see that.")
            .should("be.visible");
          PreviewSection.getPreviewTypeInput().findByText("Detail").click();
          cy.wait("@dataset");
          PreviewSection.get()
            .findByText("Sorry, you don’t have permission to see that.")
            .should("be.visible");

          cy.log("verify viz as normal user");
          cy.signInAsNormalUser();
          H.openTable({
            database: SAMPLE_DB_ID,
            table: ORDERS_ID,
            mode: "notebook",
          });
          cy.icon("join_left_outer").click();
          H.miniPicker().within(() => {
            cy.findByText("Sample Database").click();
            cy.findByText("Products").click();
          });
          cy.findByLabelText("Left column").should("contain.text", "User ID");
        });
      });
    });

    describe("Behavior", () => {
      describe("Display values", () => {
        it("should allow to change foreign key target for accessible tables", () => {
          H.activateToken("pro-self-hosted");
          setDataModelPermissions({
            tableIds: [ORDERS_ID, REVIEWS_ID, PRODUCTS_ID],
          });

          cy.signIn("none");
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.PRODUCT_ID,
          });

          FieldSection.getDisplayValuesInput().click();
          H.popover().findByText("Use foreign key").click();
          H.popover().findByText("Title").click();
          cy.wait("@updateFieldDimension");
          H.undoToast().should(
            "contain.text",
            "Display values of Product ID updated",
          );

          cy.signInAsNormalUser();
          H.openReviewsTable({ limit: 1 });
          // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Rustic Paper Wallet").should("be.visible");
        });

        it("should not allow setting foreign key target for inaccessible tables and show a proper error message when using custom mapping", () => {
          H.activateToken("pro-self-hosted");
          setDataModelPermissions({ tableIds: [REVIEWS_ID] });

          cy.signIn("none");

          cy.log(
            "should not allow setting foreign key target for inaccessible tables",
          );
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.PRODUCT_ID,
          });
          FieldSection.getDisplayValuesInput().click();

          H.popover().within(() => {
            cy.findByRole("option", { name: /Use original value/ })
              .should("be.visible")
              .and("not.have.attr", "data-combobox-disabled");
            cy.findByRole("option", { name: /Use foreign key/ })
              .should("be.visible")
              .and("have.attr", "data-combobox-disabled", "true");
          });

          cy.log(
            "should show a proper error message when using custom mapping",
          );
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });
          FieldSection.getDisplayValuesInput().click();

          H.popover().within(() => {
            cy.findByRole("option", { name: /Use original value/ })
              .should("be.visible")
              .and("not.have.attr", "data-combobox-disabled");
            cy.findByRole("option", { name: /Custom mapping/ })
              .should("be.visible")
              .and("have.attr", "data-combobox-disabled", "true");
          });

          cy.signInAsAdmin();
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });
          FieldSection.getDisplayValuesInput().click();
          H.popover().findByText("Custom mapping").click();
          cy.wait("@updateFieldDimension");
          H.undoToast().should(
            "contain.text",
            "Display values of Rating updated",
          );

          cy.signIn("none");
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });

          // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
          cy.findByText(CUSTOM_MAPPING_ERROR).should("exist");
        });
      });
    });
  });

  describe("Preview section", () => {
    it("should not close the preview when hitting Esc key while command palette is open", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.PRODUCT_ID,
      });

      FieldSection.getPreviewButton().click();
      PreviewSection.get().should("be.visible");

      H.openCommandPalette();
      H.commandPalette().should("be.visible");

      cy.realPress("Escape");
      H.commandPalette().should("not.exist");
      PreviewSection.get().should("be.visible");
    });
  });

  describe("Responsiveness", () => {
    it("should hide labels of buttons when they don't fit", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });

      cy.log("buttons should show labels when they fit");
      TableSection.getSyncOptionsButton().should("have.text", "Sync options");
      TableSection.getSortButton().should("have.text", "Sorting").click();
      TableSection.getSortDoneButton().should("have.text", "Done").click();
      FieldSection.getPreviewButton().should("have.text", "Preview");
      FieldSection.getFieldValuesButton().should("have.text", "Field values");

      cy.log("buttons should not show labels when they don't fit");
      cy.viewport(800, 800);
      TableSection.getSyncOptionsButton().should(
        "not.have.text",
        "Sync options",
      );
      TableSection.getSortButton().should("not.have.text", "Sorting").click();
      TableSection.getSortDoneButton().should("not.have.text", "Done").click();
      FieldSection.getPreviewButton().should("not.have.text", "Preview");
      FieldSection.getFieldValuesButton().should(
        "not.have.text",
        "Field values",
      );

      cy.log("buttons should have tooltips when labels are not shown");
      TableSection.getSyncOptionsButton().realHover({
        scrollBehavior: "center",
      });
      H.tooltip().should("be.visible").and("have.text", "Sync options");

      TableSection.getSortButton().realHover({
        scrollBehavior: "center",
      });
      H.tooltip().should("be.visible").and("have.text", "Sorting");

      TableSection.getSortButton().click();
      TableSection.getSortDoneButton().realHover({
        scrollBehavior: "center",
      });
      H.tooltip().should("be.visible").and("have.text", "Done");
      TableSection.getSortDoneButton().click();

      FieldSection.getPreviewButton().realHover({
        scrollBehavior: "center",
      });
      H.tooltip().should("be.visible").and("have.text", "Preview");

      FieldSection.getFieldValuesButton().realHover({
        scrollBehavior: "center",
      });
      H.tooltip().should("be.visible").and("have.text", "Field values");

      cy.log("button labels should reappear when they can fit again");
      cy.viewport(1200, 800);
      TableSection.getSyncOptionsButton().should("have.text", "Sync options");
      TableSection.getSortButton().should("have.text", "Sorting").click();
      TableSection.getSortDoneButton().should("have.text", "Done").click();
      FieldSection.getPreviewButton().should("have.text", "Preview");
      FieldSection.getFieldValuesButton().should("have.text", "Field values");
    });
  });
});

describe("issue 21984", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata?**").as("tableMetadata");

    H.restore();
    cy.signInAsAdmin();

    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: REVIEWS_ID,
    });
    cy.wait("@tableMetadata");

    cy.findByDisplayValue("ID");
  });

  it('should not show data model visited tables in search or in "Pick up where you left off" items on homepage (metabase#21984)', () => {
    cy.visit("/");

    cy.findByTestId("home-page").within(() => {
      // the table should not be in the recents results
      cy.findByText("Reviews").should("not.exist");
    });

    H.commandPaletteButton().click();
    H.commandPalette().within(() => {
      cy.findByText("Recents").should("not.exist");
    });
  });
});

describe("issue 15542", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/field/*/dimension").as("fieldDimensionUpdate");
  });

  function openOrdersTable() {
    // Navigate without reloading the page
    H.navigationSidebar().findByText("Databases").click({
      // force the click because the sidebar might be closed but
      // that is not what we are testing here.
      force: true,
    });

    cy.findByText("Sample Database").click();
    cy.findByText("Orders").click();
  }

  function openOrdersProductIdSettings() {
    // Navigate without reloading the page
    H.goToAdmin();

    H.appBar().findByText("Table Metadata").click();
    H.DataModel.TablePicker.getTable("Orders").click();
    H.DataModel.TableSection.clickField("Product ID");
  }

  it("should be possible to use the foreign key field display values immediately when changing the setting", () => {
    // This test does manual naviation instead of using openOrdersTable and similar
    // helpers because they use cy.visit under the hood and that reloads the page,
    // clearing the in-browser cache, which is what we are testing here.
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });

    H.DataModel.FieldSection.getFilteringInput().click();
    H.popover().findByText("A list of all values").click();

    H.DataModel.FieldSection.getDisplayValuesInput().click();
    H.popover().findByText("Use foreign key").click();
    H.popover().findByText("Title").click();

    cy.wait("@fieldDimensionUpdate");

    H.goToMainApp();
    openOrdersTable();

    H.tableHeaderClick("Product ID");
    H.popover().findByText("Filter by this column").click();

    H.popover().within(() => {
      cy.findByText("1").should("not.exist");
      cy.findByText("Rustic Paper Wallet").should("be.visible");
    });

    openOrdersProductIdSettings();

    H.DataModel.FieldSection.getDisplayValuesInput().click();
    H.popover().findByText("Use original value").click();

    H.goToMainApp();
    openOrdersTable();

    H.tableHeaderClick("Product ID");
    H.popover().findByText("Filter by this column").click();

    H.popover().within(() => {
      cy.findByText("1").should("be.visible");
      cy.findByText("Rustic Paper Wallet").should("not.exist");
    });
  });
});

describe("issue 52411", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/database/*/schema/*").as("getSchema");
    cy.intercept("GET", "/api/database").as("getDatabases");
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "multi_schema" });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
  });

  it("should be able to select a table in a database with multiple schemas on segments list page when there are multiple databases and there is a saved question (metabase#52411)", () => {
    cy.visit("/admin/datamodel/segments");
    cy.wait(["@getDatabases", "@getSchema"]);
    cy.findByTestId("segment-list-table").findByText("Filter by table").click();
    H.popover().within(() => {
      cy.icon("chevronleft").click(); // go back
      cy.findByText("Writable Postgres12").click();
      cy.findByText("Wild").click();
      cy.findByText("Birds").click();
    });
    cy.findByTestId("segment-list-table")
      .findByText("Birds")
      .should("be.visible");
  });
});

describe("issue 53595", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/database/*/schema/*").as("getSchema");
  });

  it("all options are visibile while filtering the list of entity types (metabase#53595)", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: PEOPLE_ID,
      fieldId: PEOPLE.ID,
    });

    H.DataModel.FieldSection.getSemanticTypeInput().focus().clear().type("cu");

    H.popover().findByText("Currency").should("be.visible");
    H.popover().then(($popover) => {
      expect(H.isScrollableVertically($popover[0])).to.be.false;
    });
  });
});

describe("issue 55619", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow you to change the currency where you can set a semantic type (metabase#55619)", () => {
    cy.log("set a non-default value");
    cy.request("PUT", `/api/field/${ORDERS.DISCOUNT}`, {
      settings: { currency: "CAD" },
    });

    cy.log("data reference - field list");
    cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields`);
    H.main().within(() => {
      cy.button(/Edit/).click();
      cy.findByDisplayValue("Canadian Dollar").click();
    });
    H.popover().findByText("Euro").click();
    H.main().within(() => {
      cy.findByDisplayValue("Euro").should("be.visible");
      cy.button(/Save/).click();
      cy.button(/Edit/).should("be.visible");
    });

    cy.log("data reference - field details");
    H.main().within(() => {
      cy.findByRole("link", { name: /Discount/ }).click();
      cy.button(/Edit/).click();
      cy.findByDisplayValue("Euro").click();
    });
    H.popover().findByText("Australian Dollar").click();
    H.main().within(() => {
      cy.findByDisplayValue("Australian Dollar").should("be.visible");
      cy.button(/Save/).click();
      cy.button(/Edit/).should("be.visible");
    });

    cy.log("model metadata");
    H.navigationSidebar().findByText("Models").click();
    H.main().within(() => {
      cy.findByLabelText("Create a new model").click();
      cy.findByText("Use the notebook editor").click();
    });
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    H.runButtonOverlay().click();
    H.tableInteractive().should("contain", "37.65");
    cy.findByTestId("editor-tabs-columns-name").click();
    H.openColumnOptions("Discount");
    cy.findByTestId("sidebar-content")
      .findByDisplayValue("Australian Dollar")
      .click();
    H.popover().findByText("Euro").click();
    cy.findByTestId("sidebar-content")
      .findByDisplayValue("Euro")
      .should("be.visible");
    H.datasetEditBar().button("Save").click();
    H.modal().button("Save").click();
    H.modal().should("not.exist"); // wait for modal to disappear
    H.queryBuilderHeader().findByText("Orders").should("be.visible"); // wait for qb to turn into view-mode
    cy.findByTestId("loading-indicator").should("not.exist"); // wait for query to complete
    H.tableHeaderColumn("Discount (€)").should("be.visible");
  });
});

const setDataModelPermissions = ({
  tableIds = [],
}: {
  tableIds: TableId[];
}) => {
  const permissions = Object.fromEntries(tableIds.map((id) => [id, "all"]));

  // @ts-expect-error invalid cy.updatePermissionsGraph typing
  cy.updatePermissionsGraph({
    [ALL_USERS_GROUP]: {
      [SAMPLE_DB_ID]: {
        "data-model": {
          schemas: {
            PUBLIC: permissions,
          },
        },
      },
    },
  });
};

function verifyTablePreview({
  column,
  description,
  values,
}: {
  column: string;
  description?: string;
  values: string[];
}) {
  PreviewSection.getPreviewTypeInput().findByText("Table").click();
  cy.wait("@dataset");

  PreviewSection.get().within(() => {
    H.assertTableData({
      columns: [column],
      firstRows: values.map((value) => [value]),
    });

    if (description != null) {
      cy.findByTestId("header-cell").realHover();
    }
  });

  if (description != null) {
    H.hovercard().should("contain.text", description);
  }
}

function verifyAndCloseToast(message: string) {
  H.undoToast().should("contain.text", message);
  H.undoToast().icon("close").click({ force: true });
}
