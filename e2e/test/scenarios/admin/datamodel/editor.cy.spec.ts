const { H } = cy;
import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  USER_GROUPS,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { TableId } from "metabase-types/api";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE_ID,
  FEEDBACK,
  FEEDBACK_ID,
} = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;
const MYSQL_DB_ID = SAMPLE_DB_ID + 1;
const MYSQL_DB_SCHEMA_ID = `${MYSQL_DB_ID}:`;

const CUSTOM_MAPPING_ERROR =
  "You need unrestricted data access on this table to map custom display values.";

describe("scenarios > admin > datamodel > editor", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/database/*/schema/*").as("fetchTables");
    cy.intercept("GET", "/api/table/*/query_metadata*").as("fetchMetadata");
    cy.intercept("PUT", "/api/table").as("updateTables");
    cy.intercept("PUT", "/api/table/*").as("updateTable");
    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("PUT", "/api/table/*/fields/order").as("updateFieldOrder");
    cy.intercept("POST", "/api/field/*/dimension").as("updateFieldDimension");
  });

  describe("table settings", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should allow changing the table name", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.getNameInput().clear().type("New orders").blur();
      cy.wait("@updateTable");

      H.undoToast().should("contain.text", "Table name updated");
      cy.findByDisplayValue("New orders").should("be.visible");
      H.DataModel.TableSection.getNameInput()
        .should("have.value", "New orders")
        .and("be.visible");
      H.DataModel.TablePicker.getTable("New orders").should("be.visible");
      H.DataModel.TablePicker.getTable("Orders").should("not.exist");

      H.startNewQuestion();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("People").should("be.visible");
        cy.findByText("New orders").should("be.visible");
      });
    });

    it("should allow changing the table description", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.getDescriptionInput()
        .clear()
        .type("New description")
        .blur();
      cy.wait("@updateTable");

      H.undoToast().should("contain.text", "Table description updated");
      H.DataModel.TableSection.getDescriptionInput()
        .should("have.value", "New description")
        .and("be.visible");

      cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New description").should("be.visible");
    });

    it("should allow clearing the table description", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.getDescriptionInput().clear().blur();
      cy.wait("@updateTable");

      H.undoToast().should("contain.text", "Table description updated");
      H.DataModel.TableSection.getDescriptionInput()
        .should("have.value", "")
        .and("be.visible");

      cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("No description yet").should("be.visible");
    });

    it("should allow changing the table visibility", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TablePicker.getTable("Orders").button("Hide table").click();
      cy.wait("@updateTable");

      H.undoToast().should("contain.text", "Hid Orders");

      H.startNewQuestion();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("People").should("be.visible");
        cy.findByText("Orders").should("not.exist");
      });

      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TablePicker.getTable("Orders").button("Unhide table").click();
      cy.wait("@updateTable");

      H.undoToast().should("contain.text", "Unhid Orders");

      H.startNewQuestion();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("People").should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });
    });

    it("should allow changing the field name", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.getFieldNameInput("Tax")
        .clear()
        .type("New tax")
        .blur();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Display name for Tax updated");
      H.DataModel.TableSection.getFieldNameInput("New tax").should(
        "be.visible",
      );

      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New tax").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Tax").should("not.exist");
    });

    it("should allow changing the field description", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.getFieldDescriptionInput("Total")
        .clear()
        .type("New description")
        .blur();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Description for Total updated");
      H.DataModel.TableSection.getFieldDescriptionInput("Total").should(
        "have.value",
        "New description",
      );

      cy.visit(
        `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New description").should("be.visible");
    });

    it("should allow clearing the field description", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.getFieldDescriptionInput("Total").clear().blur();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Description for Total updated");
      H.DataModel.TableSection.getFieldDescriptionInput("Total").should(
        "have.value",
        "",
      );

      cy.visit(
        `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("No description yet").should("be.visible");
    });

    it("should allow changing the field visibility", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
      });

      H.DataModel.FieldSection.getVisibilityInput()
        .should("have.value", "Everywhere")
        .click();
      H.popover().findByText("Do not include").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Visibility for Tax updated");
      H.DataModel.FieldSection.getVisibilityInput().should(
        "have.value",
        "Do not include",
      );

      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Tax").should("not.exist");
    });

    it("should allow changing the field semantic type and currency", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
      });

      H.DataModel.FieldSection.getSemanticTypeInput()
        .should("have.value", "No semantic type")
        .click();
      H.popover().findByText("Currency").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Semantic type for Tax updated");
      H.DataModel.FieldSection.getSemanticTypeCurrencyInput()
        .scrollIntoView()
        .should("be.visible")
        .and("have.value", "US Dollar")
        .click();
      H.popover().findByText("Canadian Dollar").click();
      cy.wait("@updateField");

      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Tax (CA$)").should("be.visible");
    });

    it("should allow changing the field foreign key target", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.USER_ID,
      });

      H.DataModel.FieldSection.getSemanticTypeFkTarget()
        .should("have.value", "People → ID")
        .click();
      H.popover().findByText("Products → ID").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Semantic type for User ID updated");
      H.DataModel.FieldSection.getSemanticTypeFkTarget().should(
        "have.value",
        "Products → ID",
      );

      H.openTable({
        database: SAMPLE_DB_ID,
        table: ORDERS_ID,
        mode: "notebook",
      });
      cy.icon("join_left_outer").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("Products").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("User ID").should("be.visible");
    });

    it("should allow sorting fields as in the database", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
      });

      H.DataModel.TableSection.getSortButton().click();
      H.DataModel.TableSection.getSortOrderInput()
        .findByDisplayValue("database")
        .should("be.checked");

      H.openProductsTable();
      assertTableHeader([
        "ID",
        "Ean",
        "Title",
        "Category",
        "Vendor",
        "Price",
        "Rating",
        "Created At",
      ]);
    });

    it("should allow sorting fields alphabetically", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
      });

      H.DataModel.TableSection.getSortButton().click();
      H.DataModel.TableSection.getSortOrderInput()
        .findByLabelText("Alphabetical order")
        .click();
      cy.wait("@updateTable");

      H.DataModel.TableSection.getSortOrderInput()
        .findByDisplayValue("alphabetical")
        .should("be.checked");

      H.openProductsTable();
      assertTableHeader([
        "Category",
        "Created At",
        "Ean",
        "ID",
        "Price",
        "Rating",
        "Title",
        "Vendor",
      ]);
    });

    it("should allow sorting fields smartly", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
      });

      H.DataModel.TableSection.getSortButton().click();
      H.DataModel.TableSection.getSortOrderInput()
        .findByLabelText("Auto order")
        .click();
      cy.wait("@updateTable");

      H.DataModel.TableSection.getSortOrderInput()
        .findByDisplayValue("smart")
        .should("be.checked");

      H.openProductsTable();
      assertTableHeader([
        "ID",
        "Created At",
        "Category",
        "Ean",
        "Price",
        "Rating",
        "Title",
        "Vendor",
      ]);
    });

    it("should allow sorting fields in the custom order", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
      });

      H.DataModel.TableSection.getSortButton().click();
      H.DataModel.TableSection.getSortOrderInput()
        .findByDisplayValue("database")
        .should("be.checked");

      H.moveDnDKitElement(H.DataModel.TableSection.getSortableField("ID"), {
        vertical: 50,
      });
      cy.wait("@updateFieldOrder");

      cy.log("should not show loading state after an update (metabase#56482)");
      cy.findByTestId("loading-indicator", { timeout: 0 }).should("not.exist");

      H.DataModel.TableSection.getSortOrderInput()
        .findByDisplayValue("custom")
        .should("be.checked");

      H.openProductsTable();
      assertTableHeader([
        "Ean",
        "ID",
        "Title",
        "Category",
        "Vendor",
        "Price",
        "Rating",
        "Created At",
      ]);
    });

    it("should allow switching to predefined order after drag & drop (metabase#56482)", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
      });

      H.DataModel.TableSection.getSortButton().click();
      H.DataModel.TableSection.getSortOrderInput()
        .findByDisplayValue("database")
        .should("be.checked");

      H.moveDnDKitElement(H.DataModel.TableSection.getSortableField("ID"), {
        vertical: 50,
      });
      cy.wait("@updateFieldOrder");

      cy.log("should not show loading state after an update (metabase#56482)");
      cy.findByTestId("loading-indicator", { timeout: 0 }).should("not.exist");

      H.DataModel.TableSection.getSortableFields().should(($items) => {
        expect($items[0].textContent).to.equal("Ean");
        expect($items[1].textContent).to.equal("ID");
      });

      H.DataModel.TableSection.getSortOrderInput()
        .findByDisplayValue("custom")
        .should("be.checked");

      cy.log(
        "should allow switching to predefined order afterwards (metabase#56482)",
      );
      H.DataModel.TableSection.getSortOrderInput()
        .findByLabelText("Database order")
        .click();
      cy.wait("@updateTable");

      H.DataModel.TableSection.getSortOrderInput()
        .findByDisplayValue("database")
        .should("be.checked");
      H.DataModel.TableSection.getSortableFields().should(($items) => {
        expect($items[0].textContent).to.equal("ID");
        expect($items[1].textContent).to.equal("Ean");
      });

      cy.log("should allow drag & drop afterwards (metabase#56482)"); // extra sanity check
      H.moveDnDKitElement(H.DataModel.TableSection.getSortableField("ID"), {
        vertical: 50,
      });
      cy.wait("@updateFieldOrder");

      cy.log("should not show loading state after an update (metabase#56482)");
      cy.findByTestId("loading-indicator", { timeout: 0 }).should("not.exist");

      H.DataModel.TableSection.getSortableFields().should(($items) => {
        expect($items[0].textContent).to.equal("Ean");
        expect($items[1].textContent).to.equal("ID");
      });
    });

    // TODO: https://linear.app/metabase/issue/SEM-299
    it.skip("should allow hiding and restoring all tables in a schema", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("4 Queryable Tables").should("be.visible");
      cy.findByLabelText("Hide all").click();
      cy.wait("@updateTables");

      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("8 Hidden Tables").should("be.visible");
      cy.findByLabelText("Unhide all").click();
      cy.wait("@updateTables");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("8 Queryable Tables").should("be.visible");
    });
  });

  describe("field settings", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should allow changing the field name", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
      });

      H.DataModel.FieldSection.getNameInput().clear().type("New tax").blur();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Display name for Tax updated");
      H.DataModel.FieldSection.getNameInput().should("have.value", "New tax");
      H.DataModel.TableSection.getFieldNameInput("New tax").should(
        "be.visible",
      );

      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New tax").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Tax").should("not.exist");
    });

    it("should allow changing the field description", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TOTAL,
      });

      H.DataModel.FieldSection.getDescriptionInput()
        .clear()
        .type("New description")
        .blur();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Description for Total updated");
      H.DataModel.FieldSection.getDescriptionInput().should(
        "have.value",
        "New description",
      );
      H.DataModel.TableSection.getFieldDescriptionInput("Total").should(
        "have.value",
        "New description",
      );

      cy.visit(
        `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New description").should("be.visible");
    });

    it("should allow changing the field visibility", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
      });

      H.DataModel.FieldSection.getVisibilityInput().click();
      H.popover().findByText("Do not include").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Visibility for Tax updated");
      H.DataModel.FieldSection.getVisibilityInput().should(
        "have.value",
        "Do not include",
      );

      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Tax").should("not.exist");
    });

    it("should allow changing the field semantic type and currency", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
      });

      H.DataModel.FieldSection.getSemanticTypeInput()
        .should("have.value", "No semantic type")
        .click();
      H.popover().findByText("Currency").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Semantic type for Tax updated");

      H.DataModel.FieldSection.getSemanticTypeCurrencyInput()
        .should("be.visible")
        .and("have.value", "US Dollar")
        .click();
      H.popover().findByText("Canadian Dollar").click();
      cy.wait("@updateField");

      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Tax (CA$)").should("be.visible");
    });

    it("should allow changing the field foreign key target", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.USER_ID,
      });

      H.DataModel.FieldSection.getSemanticTypeFkTarget()
        .should("have.value", "People → ID")
        .click();
      H.popover().findByText("Products → ID").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Semantic type for User ID updated");
      H.DataModel.FieldSection.getSemanticTypeFkTarget().should(
        "have.value",
        "Products → ID",
      );

      H.openTable({
        database: SAMPLE_DB_ID,
        table: ORDERS_ID,
        mode: "notebook",
      });
      cy.icon("join_left_outer").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("Products").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("User ID").should("be.visible");
    });

    it("should allow you to cast a field to a data type", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: FEEDBACK_ID,
        fieldId: FEEDBACK.RATING,
      });

      cy.log(
        "Ensure that Coercion strategy has been humanized (metabase#44723)",
      );
      H.DataModel.FieldSection.getCoercionToggle()
        .parent()
        .scrollIntoView()
        .click();
      H.popover().should("not.contain.text", "Coercion");
      H.popover().findByText("UNIX seconds → Datetime").click();
      cy.wait("@updateField");

      H.openTable({ database: SAMPLE_DB_ID, table: FEEDBACK_ID });
      cy.findAllByTestId("cell-data")
        .contains("December 31, 1969, 4:00 PM")
        .should("have.length.greaterThan", 0);
    });
  });

  describe("data model permissions", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("should allow changing the table name with data model permissions only", () => {
      setDataModelPermissions({ tableIds: [ORDERS_ID] });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.getNameInput().clear().type("New orders").blur();
      cy.wait("@updateTable");

      H.DataModel.TableSection.getNameInput().should(
        "have.value",
        "New orders",
      );

      H.undoToast().should("contain.text", "Table name updated");
      cy.signOut();

      cy.signInAsNormalUser();
      H.startNewQuestion();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("People").should("be.visible");
        cy.findByText("New orders").should("be.visible");
      });
    });

    it("should allow changing the field name with data model permissions only in table settings", () => {
      setDataModelPermissions({ tableIds: [ORDERS_ID] });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });
      H.DataModel.TableSection.getFieldNameInput("Tax")
        .clear()
        .type("New tax")
        .blur();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Display name for Tax updated");
      H.DataModel.TableSection.getFieldNameInput("New tax").should(
        "be.visible",
      );
      H.DataModel.TableSection.getField("New tax").should("be.visible");

      cy.signInAsNormalUser();
      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New tax").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Tax").should("not.exist");
    });

    it("should allow changing the field name with data model permissions only in field settings", () => {
      setDataModelPermissions({ tableIds: [ORDERS_ID] });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TOTAL,
      });

      H.DataModel.FieldSection.getNameInput().clear().type("New total").blur();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Display name for Total updated");
      H.DataModel.FieldSection.getNameInput().should("have.value", "New total");
      H.DataModel.TableSection.getFieldNameInput("New total")
        .scrollIntoView()
        .should("be.visible");

      cy.signInAsNormalUser();
      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New total").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total").should("not.exist");
    });

    it("should allow changing the field foreign key target", () => {
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
      H.DataModel.FieldSection.getSemanticTypeFkTarget()
        .should("have.value", "People → ID")
        .click();
      H.popover().within(() => {
        cy.findByText("Reviews → ID").should("not.exist");
        cy.findByText("Products → ID").click();
      });
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Semantic type for User ID updated");
      H.DataModel.FieldSection.getSemanticTypeFkTarget()
        .should("have.value", "Products → ID")
        .and("be.visible");

      cy.signInAsNormalUser();
      H.openTable({
        database: SAMPLE_DB_ID,
        table: ORDERS_ID,
        mode: "notebook",
      });
      cy.icon("join_left_outer").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("Products").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("User ID").should("be.visible");
    });

    // TODO: https://linear.app/metabase/issue/SEM-434
    it.skip("should allow setting foreign key mapping for accessible tables", () => {
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

      H.DataModel.FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Use foreign key").click();
      H.popover().findByText("Title").click();
      cy.wait("@updateFieldDimension");

      cy.signInAsNormalUser();
      H.openReviewsTable({ limit: 1 });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Rustic Paper Wallet").should("be.visible");
    });

    it("should now allow setting foreign key mapping for inaccessible tables", () => {
      setDataModelPermissions({ tableIds: [REVIEWS_ID] });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: REVIEWS_ID,
        fieldId: REVIEWS.PRODUCT_ID,
      });
      H.DataModel.FieldSection.getDisplayValuesInput().click();

      H.popover().within(() => {
        cy.findByRole("option", { name: /Use original value/ })
          .should("be.visible")
          .and("not.have.attr", "data-combobox-disabled");
        cy.findByRole("option", { name: /Use foreign key/ })
          .should("be.visible")
          .and("have.attr", "data-combobox-disabled", "true");
      });
    });

    it("should show a proper error message when using custom mapping", () => {
      setDataModelPermissions({ tableIds: [REVIEWS_ID] });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: REVIEWS_ID,
        fieldId: REVIEWS.RATING,
      });
      H.DataModel.FieldSection.getDisplayValuesInput().click();

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
      H.DataModel.FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Custom mapping").click();
      cy.wait("@updateFieldDimension");

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: REVIEWS_ID,
        fieldId: REVIEWS.RATING,
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(CUSTOM_MAPPING_ERROR).should("exist");
    });
  });

  describe("databases without schemas", { tags: ["@external"] }, () => {
    beforeEach(() => {
      H.restore("mysql-8");
      cy.signInAsAdmin();
    });

    it("should be able to select and update a table in a database without schemas", () => {
      H.DataModel.visit({
        databaseId: MYSQL_DB_ID,
        schemaId: MYSQL_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.getNameInput().clear().type("New orders").blur();
      cy.wait("@updateTable");

      H.undoToast().should("contain.text", "Table name updated");
      H.DataModel.TableSection.getNameInput().should(
        "have.value",
        "New orders",
      );
    });

    it("should be able to select and update a field in a database without schemas", () => {
      H.DataModel.visit({
        databaseId: MYSQL_DB_ID,
        schemaId: MYSQL_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.clickField("Tax");
      H.DataModel.FieldSection.getVisibilityInput().click();
      H.popover().findByText("Do not include").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Visibility for Tax updated");
      H.DataModel.FieldSection.getVisibilityInput().should(
        "have.value",
        "Do not include",
      );
    });
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

const assertTableHeader = (columns: string[]) => {
  cy.findAllByTestId("header-cell").should("have.length", columns.length);

  columns.forEach((column, index) => {
    // eslint-disable-next-line no-unsafe-element-filtering
    cy.findAllByTestId("header-cell").eq(index).should("have.text", column);
  });
};
