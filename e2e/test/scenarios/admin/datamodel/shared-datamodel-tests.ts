/**
 * Shared test suite for Data Model tests.
 * This file contains common test logic used by both:
 * - Admin Data Model (/admin/datamodel)
 * - Data Studio Data Model (/data-studio/data)
 */

import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;
const {
  FEEDBACK,
  FEEDBACK_ID,
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS,
  REVIEWS,
  REVIEWS_ID,
  PRODUCTS_ID,
} = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;
const MYSQL_DB_ID = SAMPLE_DB_ID + 1;
const MYSQL_DB_SCHEMA_ID = `${MYSQL_DB_ID}:`;
const { FieldSection, PreviewSection, TablePicker, TableSection } = H.DataModel;

const CUSTOM_MAPPING_ERROR =
  "You need unrestricted data access on this table to map custom display values.";

export interface DataModelTestConfig {
  /** Name of the test suite (e.g., "admin" or "data-studio") */
  suiteName: string;
  /** Function to visit the data model page */
  visitFn: typeof H.DataModel.visit | typeof H.DataModel.visitDataStudio;
  /** Base path for URLs (e.g., "/admin/datamodel" or "/data-studio/data") */
  basePath: string;
  /** Whether beforeEach should include bleeding-edge token activation */
  activateBleedingEdge?: boolean;
  /** Custom intercepts to add in beforeEach */
  customIntercepts?: () => void;
  /** Empty state expectations differ between admin (text) and data studio (absence) */
  emptyStateExpectations?: {
    table: "text" | "absent";
    field: "text" | "absent";
  };
  /** Optional tracking source for Snowplow assertions when needed */
  trackingSource?: "admin" | "data_studio";
}

export const SHARED_CONSTANTS = {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
  MYSQL_DB_ID,
  MYSQL_DB_SCHEMA_ID,
  FEEDBACK,
  FEEDBACK_ID,
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS,
  REVIEWS,
  REVIEWS_ID,
  PRODUCTS_ID,
  ALL_USERS_GROUP,
  CUSTOM_MAPPING_ERROR,
  ORDERS_QUESTION_ID,
};

export const SHARED_HELPERS = {
  FieldSection,
  PreviewSection,
  TablePicker,
  TableSection,
};

export function expectTableEmptyState(kind: "text" | "absent" = "text") {
  if (kind === "absent") {
    H.DataModel.TableSection.get().should("not.exist");
    return;
  }

  H.DataModel.get()
    .findByText("Start by selecting data to model")
    .should("be.visible");
  H.DataModel.get()
    .findByText("Browse your databases to find the table you’d like to edit.")
    .should("be.visible");
}

export function expectFieldEmptyState(kind: "text" | "absent" = "text") {
  if (kind === "absent") {
    H.DataModel.FieldSection.get().should("not.exist");
    return;
  }

  H.DataModel.get()
    .findByText("Edit the table and fields")
    .should("be.visible");
  H.DataModel.get()
    .findByText(
      "Select a field to edit its name, description, formatting, and more.",
    )
    .should("be.visible");
}

/**
 * Sets up common intercepts used by both test suites
 */
export function setupCommonIntercepts() {
  cy.intercept("GET", "/api/database?*").as("databases");
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
  cy.intercept("PUT", "/api/table").as("updateTables");
  cy.intercept("PUT", "/api/table/*").as("updateTable");
}

/**
 * Common test helpers used across both test suites
 */

export function verifyAndCloseToast(text: string) {
  cy.findByTestId("toast-undo")
    .should("be.visible")
    .findByText(text)
    .should("be.visible");
  cy.findByTestId("toast-undo")
    .findByRole("button", { name: /close/i })
    .click();
  cy.findByTestId("toast-undo").should("not.exist");
}

export function verifyToastAndUndo(text: string) {
  cy.findByTestId("toast-undo")
    .should("be.visible")
    .findByText(text)
    .should("be.visible");
  cy.findByTestId("toast-undo")
    .findByRole("button", { name: /undo/i })
    .click();
  cy.findByTestId("toast-undo").should("not.exist");
}

export function clickAway() {
  cy.findByTestId("admin-layout-content").click(0, 0);
}

export function verifyTablePreview({
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

export function verifyObjectDetailPreview({
  rowNumber,
  row,
}: {
  rowNumber: number;
  row: [string, string];
}) {
  const [label, value] = row;

  PreviewSection.getPreviewTypeInput().findByText("Detail").click();
  cy.wait("@dataset");

  cy.findAllByTestId("column-name").then(($els) => {
    const foundRowIndex = $els
      .toArray()
      .findIndex((el) => el.textContent?.trim() === label);

    expect(rowNumber).to.eq(foundRowIndex);

    cy.findAllByTestId("value")
      .should("have.length.gte", foundRowIndex)
      .eq(foundRowIndex)
      .should("contain", value);
  });
}

/**
 * Creates the shared test suite with configuration
 */
export function createSharedDataModelTests(config: DataModelTestConfig) {
  const { visitFn, basePath } = config;
  const trackingSource = config.trackingSource;
  const expectTableEmptyStateBase = expectTableEmptyState;
  const expectFieldEmptyStateBase = expectFieldEmptyState;
  const emptyStateExpectations = {
    table: "text",
    field: "text",
    ...config.emptyStateExpectations,
  };

  const expectTableEmptyState = () =>
    expectTableEmptyStateBase(emptyStateExpectations.table);
  const expectFieldEmptyState = () =>
    expectFieldEmptyStateBase(emptyStateExpectations.field);

  describe("Data loading", () => {
    it("should show 404 if database does not exist (metabase#14652)", () => {
      visitFn({ databaseId: 54321, skipWaiting: true });
      cy.wait("@databases");
      cy.wait(100); // wait with assertions for React effects to kick in

      TablePicker.getDatabases().should("have.length", 1);
      TablePicker.getTables().should("have.length", 0);
      H.DataModel.get().findByText("Not found.").should("be.visible");
      cy.location("pathname").should("eq", `${basePath}/database/54321`);
    });

    it("should show 404 if table does not exist", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: 12345,
        skipWaiting: true,
      });
      cy.wait("@databases");
      cy.wait(100); // wait with assertions for React effects to kick in

      TablePicker.getDatabases().should("have.length", 1);
      TablePicker.getTables().should("have.length", 8);
      H.DataModel.get().findByText("Not found.").should("be.visible");
      cy.location("pathname").should(
        "eq",
        `${basePath}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/12345`,
      );
    });

    it("should show 404 if field does not exist", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: 12345,
        skipWaiting: true,
      });
      cy.wait("@databases");
      cy.wait(100); // wait with assertions for React effects to kick in

      TablePicker.getDatabases().should("have.length", 1);
      TablePicker.getTables().should("have.length", 8);
      H.DataModel.get().findByText("Not found.").should("be.visible");
      cy.location("pathname").should(
        "eq",
        `${basePath}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/12345`,
      );
    });

    it("should not show 404 if visiting without a database selected", () => {
      visitFn({ skipWaiting: true });

      cy.wait("@databases");
      cy.wait(100); // wait with assertions for React effects to kick in

      TablePicker.getDatabases().should("have.length", 1);
      TablePicker.getTables().should("have.length", 0);
      H.DataModel.get().findByText("Not found.").should("not.exist");
    });
  });

  describe("Table section", () => {
    describe("Basics", () => {
      it("should show all tables in sample database and fields in orders table", () => {
        visitFn({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TablePicker.getTables().should("have.length", 8);

        TableSection.clickField("ID");
        FieldSection.getDataType().should("be.visible").and("have.text", "BIGINT");
        FieldSection.getSemanticTypeInput().should("have.value", "Entity Key");

        TableSection.clickField("User ID");
        FieldSection.getDataType().should("have.text", "INTEGER");
        FieldSection.getSemanticTypeInput().should("have.value", "Foreign Key");
        FieldSection.getSemanticTypeFkTarget().should("have.value", "People → ID");

        TableSection.clickField("Tax");
        FieldSection.getDataType().should("have.text", "DOUBLE PRECISION");
        FieldSection.getSemanticTypeInput().should("have.value", "No semantic type");

        TableSection.clickField("Discount");
        FieldSection.getDataType().should("have.text", "DOUBLE PRECISION");
        FieldSection.getSemanticTypeInput().should("have.value", "Discount");

        TableSection.clickField("Created At");
        FieldSection.getDataType().should("have.text", "TIMESTAMP");
        FieldSection.getSemanticTypeInput().should("have.value", "Creation timestamp");
      });

      it("should be able to preview the table in the query builder", () => {
        visitFn({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });
        TableSection.getQueryBuilderLink().click();
        H.queryBuilderHeader().findByText("Orders").should("be.visible");
      });

      it("should be able to see details of a table", () => {
        visitFn({ databaseId: SAMPLE_DB_ID });

        expectTableEmptyState();

        TablePicker.getTable("Orders").click();
        expectFieldEmptyState();
        TableSection.getNameInput().should("have.value", "Orders");
        TableSection.getDescriptionInput().should(
          "have.value",
          "Confirmed Sample Company orders for a product, from a user.",
        );
      });
    });

    describe("Name and description", () => {
      it("should allow changing the table name", () => {
        visitFn({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getNameInput().clear().type("New orders").blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table name updated");
        TableSection.getNameInput().should("have.value", "New orders");

        H.startNewQuestion();
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("People").should("be.visible");
          cy.findByText("New orders").should("be.visible");
        });
      });

      it("should allow changing the table description", () => {
        visitFn({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getDescriptionInput()
          .clear()
          .type("New description")
          .blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table description updated");
        TableSection.getDescriptionInput().should(
          "have.value",
          "New description",
        );

        cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Orders").should("be.visible");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("New description").should("be.visible");
      });

      it("should allow clearing the table description", () => {
        cy.request("PUT", `/api/table/${ORDERS_ID}`, {
          description: "test",
        });

        visitFn({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getDescriptionInput().should("have.value", "test");
        TableSection.getDescriptionInput().clear().blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table description updated");
        TableSection.getDescriptionInput().should("have.value", "");

        cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Orders").should("be.visible");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("test").should("not.exist");
      });
    });

    describe("Sync options", () => {
      it("should allow syncing table schema, re-scanning table, and discarding cached field values", () => {
        visitFn({
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

  describe("Field name and description", () => {
    it("should allow changing the field name", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      TableSection.getFieldNameInput("Tax").clear().type("New tax").blur();
      cy.wait("@updateField");
      verifyAndCloseToast("Name of Tax updated");
      TableSection.getFieldNameInput("New tax").should("be.visible");

      cy.log("verify preview");
      TableSection.clickField("New tax");
      FieldSection.getPreviewButton().click();
      verifyTablePreview({
        column: "New tax",
        values: ["2.07", "6.1", "2.9", "6.01", "7.03"],
      });
      verifyObjectDetailPreview({ rowNumber: 4, row: ["New tax", "2.07"] });

      cy.log("verify viz");
      H.openOrdersTable();
      H.tableHeaderColumn("New tax").should("be.visible");
      H.tableHeaderColumn("Tax", { scrollIntoView: false }).should(
        "not.exist",
      );
    });

    it("should allow changing the field description", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      TableSection.getFieldDescriptionInput("Total")
        .clear()
        .type("New description")
        .blur();
      cy.wait("@updateField");
      verifyAndCloseToast("Description of Total updated");
      TableSection.getFieldDescriptionInput("Total").should(
        "have.value",
        "New description",
      );

      cy.log("verify preview");
      TableSection.clickField("Total");
      FieldSection.getPreviewButton().click();
      verifyTablePreview({
        column: "Total",
        description: "New description",
        values: ["39.72", "117.03", "52.72", "113.58", "123.29"],
      });

      cy.visit(
        `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New description").should("be.visible");
    });
  });

  describe("Sorting", () => {
    it("should allow sorting fields as in the database", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
      });

      TableSection.getSortButton().click();
      TableSection.getSortOrderInput()
        .findByDisplayValue("database")
        .should("be.checked");

      H.openProductsTable();
      H.assertTableData({
        columns: [
          "ID",
          "Ean",
          "Title",
          "Category",
          "Vendor",
          "Price",
          "Rating",
          "Created At",
        ],
      });
    });

    it("should allow sorting fields alphabetically", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
      });

      TableSection.getSortButton().click();
      TableSection.getSortOrderInput()
        .findByLabelText("Alphabetical order")
        .click();
      cy.wait("@updateTable");
      verifyAndCloseToast("Field order updated");
      TableSection.getSortOrderInput()
        .findByDisplayValue("alphabetical")
        .should("be.checked");

      H.openProductsTable();
      H.assertTableData({
        columns: [
          "Category",
          "Created At",
          "Ean",
          "ID",
          "Price",
          "Rating",
          "Title",
          "Vendor",
        ],
      });
    });

    it("should allow sorting fields smartly", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
      });

      TableSection.getSortButton().click();
      TableSection.getSortOrderInput().findByLabelText("Auto order").click();
      cy.wait("@updateTable");
      verifyAndCloseToast("Field order updated");
      TableSection.getSortOrderInput()
        .findByDisplayValue("smart")
        .should("be.checked");

      H.openProductsTable();
      H.assertTableData({
        columns: [
          "ID",
          "Created At",
          "Category",
          "Ean",
          "Price",
          "Rating",
          "Title",
          "Vendor",
        ],
      });
    });

    it("should allow sorting fields in the custom order", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
      });

      TableSection.getSortButton().click();
      TableSection.getSortOrderInput()
        .findByDisplayValue("database")
        .should("be.checked");

      H.moveDnDKitElement(TableSection.getSortableField("ID"), {
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

      TableSection.getSortOrderInput()
        .findByDisplayValue("custom")
        .should("be.checked");

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

    it("should allow switching to predefined order after drag & drop (metabase#56482)", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
      });

      TableSection.getSortButton().click();
      TableSection.getSortOrderInput()
        .findByDisplayValue("database")
        .should("be.checked");

      H.moveDnDKitElement(TableSection.getSortableField("ID"), {
        vertical: 50,
      });
      cy.wait("@updateFieldOrder");
      verifyAndCloseToast("Field order updated");

      TableSection.getSortOrderInput()
        .findByDisplayValue("custom")
        .should("be.checked");

      TableSection.getSortOrderInput().findByLabelText("Auto order").click();
      cy.wait("@updateTable");
      verifyAndCloseToast("Field order updated");

      cy.log("should not show loading state after an update (metabase#56482)");
      cy.findByTestId("loading-indicator", { timeout: 0 }).should(
        "not.exist",
      );

      TableSection.getSortOrderInput()
        .findByDisplayValue("smart")
        .should("be.checked");
    });
  });

  describe("Field values", () => {
    it("should allow re-scanning field values and discarding cached results", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
        fieldId: PRODUCTS.CATEGORY,
      });
      FieldSection.getFieldValuesButton().click();

      cy.log("re-scan field");
      H.modal().within(() => {
        cy.button("Re-scan field").click();
        cy.button("Re-scan field").should("not.exist");
        cy.button("Scan triggered!").should("be.visible");
        cy.button("Scan triggered!").should("not.exist");
        cy.button("Re-scan field").should("be.visible");
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

    it("should not automatically re-fetch field values when they are discarded unless 'Custom mapping' is used (metabase#62626)", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
        fieldId: PRODUCTS.CATEGORY,
      });

      FieldSection.getFieldValuesButton().click();
      H.modal().within(() => {
        cy.button("Discard cached field values").click();
        cy.button("Discard triggered!").should("be.visible");
        cy.button("Discard triggered!").should("not.exist");
      });

      cy.get("@fieldValues.all").should("have.length", 0);
    });
  });

  describe("Semantic types", () => {
    it("should allow to change the type to 'Foreign Key' and choose the target field (metabase#59052)", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });

      FieldSection.getSemanticTypeInput()
        .should("have.value", "Quantity")
        .click();
      H.popover().findByText("Foreign Key").click();
      cy.wait("@updateField");
      verifyAndCloseToast("Semantic type of Quantity updated");

      cy.log("verify preview");
      FieldSection.getPreviewButton().click();
      cy.wait("@dataset");
      PreviewSection.get()
        .findAllByTestId("cell-data")
        .should("have.length", 6)
        .eq(1)
        // FKs get blueish background
        .should("not.have.css", "background-color", "rgba(0, 0, 0, 0)");

      FieldSection.getSemanticTypeFkTarget()
        .should("have.value", "")
        // it should allow to just type to search (metabase#59052)
        .type("products{downarrow}{enter}");
      cy.wait("@updateField");
      H.undoToast().should(
        "contain.text",
        "Semantic type of Quantity updated",
      );

      cy.log("verify preview");
      cy.wait("@dataset");
      PreviewSection.get()
        .findAllByTestId("cell-data")
        .should("have.length", 6)
        .eq(1)
        // FKs get blueish background
        .should("not.have.css", "background-color", "rgba(0, 0, 0, 0)");

      cy.reload();
      cy.wait(["@metadata", "@metadata"]);

      FieldSection.getSemanticTypeFkTarget()
        .should("be.visible")
        .and("have.value", "Products → ID");
    });
  });

  describe("Visibility", () => {
    it("should let you change field visibility to 'Do not include'", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
      });

      FieldSection.getVisibilityInput()
        .should("have.value", "Everywhere")
        .click();
      H.popover().findByText("Do not include").click();
      cy.wait("@updateField");
      verifyAndCloseToast("Visibility of Tax updated");
      FieldSection.getVisibilityInput().should(
        "have.value",
        "Do not include",
      );

      cy.log("verify preview");
      TableSection.clickField("Tax");
      FieldSection.getPreviewButton().click();
      PreviewSection.get()
        .findByText("This field is hidden")
        .should("be.visible");
      cy.get("@dataset.all").should("have.length", 0);
      PreviewSection.getPreviewTypeInput().findByText("Detail").click();
      cy.wait("@dataset");
      PreviewSection.get().findByText("Tax").should("not.exist");

      cy.log("table viz");
      H.openOrdersTable();
      H.tableHeaderColumn("Total").should("be.visible");
      H.tableHeaderColumn("Tax", { scrollIntoView: false }).should(
        "not.exist",
      );

      cy.log("object detail viz");
      cy.findByTestId("table-body")
        .findAllByTestId("cell-data")
        .eq(0)
        .click();
      H.modal().findByText("Tax").should("not.exist");
      H.modal().findByText("2.07").should("not.exist");
    });

    it("should let you change field visibility to 'Do not include' even if Preview is opened (metabase#61806)", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
      });

      TableSection.clickField("Tax");
      FieldSection.getPreviewButton().click();
      PreviewSection.get().within(() => {
        cy.findByText("Filtering").click();

        cy.findByTestId("number-filter-picker").should("be.visible");
      });

      FieldSection.getVisibilityInput()
        .should("have.value", "Everywhere")
        .click();
      H.popover().findByText("Do not include").click();
      cy.wait("@updateField");

      PreviewSection.get()
        .findByText("This field is hidden")
        .should("be.visible");
    });

    it("should let you change field visibility to 'Only in detail views'", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
      });

      FieldSection.getVisibilityInput()
        .should("have.value", "Everywhere")
        .click();
      H.popover().findByText("Only in detail views").click();
      cy.wait("@updateField");
      verifyAndCloseToast("Visibility of Tax updated");
      FieldSection.getVisibilityInput().should(
        "have.value",
        "Only in detail views",
      );

      cy.log("verify preview");
      TableSection.clickField("Tax");
      FieldSection.getPreviewButton().click();
      PreviewSection.get()
        .findByText("This field is hidden")
        .should("be.visible");
      cy.get("@dataset.all").should("have.length", 0);
      verifyObjectDetailPreview({
        rowNumber: 4,
        row: ["Tax", "2.07"],
      });

      cy.log("table viz");
      H.openOrdersTable();
      H.tableHeaderColumn("Total").should("be.visible");
      H.tableHeaderColumn("Tax", { scrollIntoView: false }).should(
        "not.exist",
      );

      cy.log("object detail viz");
      cy.findByTestId("table-body")
        .findAllByTestId("cell-data")
        .eq(0)
        .click();
      H.modal().findByText("Tax").should("be.visible");
      H.modal().findByText("2.07").should("be.visible");
    });
  });

  describe("Display values", () => {
    it("should show tooltips explaining why remapping options are disabled", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PRODUCTS_ID,
        fieldId: PRODUCTS.TITLE,
      });

      FieldSection.getDisplayValuesInput().click();

      cy.log("foreign key mapping");
      H.popover().within(() => {
        cy.findByRole("option", { name: /Use foreign key/ }).should(
          "have.attr",
          "data-combobox-disabled",
          "true",
        );
        cy.findByRole("option", { name: /Use foreign key/ })
          .icon("info")
          .realHover();
      });
      H.tooltip().should(
        "contain.text",
        'You can only use foreign key mapping for fields with the semantic type set to "Foreign Key"',
      );

      cy.log("custom mapping");
      H.popover().within(() => {
        cy.findByRole("option", { name: /Custom mapping/ }).should(
          "have.attr",
          "data-combobox-disabled",
          "true",
        );
        cy.findByRole("option", { name: /Custom mapping/ })
          .icon("info")
          .realHover();
      });
      H.tooltip().should(
        "contain.text",
        'You can only use custom mapping for numerical fields with filtering set to "A list of all values"',
      );

      cy.log("clicking disabled option does not change the value");
      cy.findByRole("option", { name: /Custom mapping/ }).click({
        force: true, // try to click it despite pointer-events: none
      });
      FieldSection.getDisplayValuesInput().should(
        "have.value",
        "Use original value",
      );
    });
  });

  describe("Formatting", () => {
    it("should only show currency formatting options for currency fields", () => {
      visitFn({
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

      visitFn({
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
      verifyAndCloseToast("Formatting of Quantity updated");

      cy.findByTestId("column-settings").within(() => {
        cy.findByText("Unit of currency").should("be.visible");
        cy.findByText("Currency label style").should("be.visible");
      });
    });

    it("should save and obey field prefix formatting settings", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });
      cy.wait("@metadata");

      FieldSection.getPrefixInput().scrollIntoView().type("about ").blur();
      cy.wait("@updateField");
      verifyAndCloseToast("Formatting of Quantity updated");

      cy.log("verify preview");
      FieldSection.getPreviewButton().click();
      verifyTablePreview({
        column: "Quantity",
        values: ["about 2", "about 3", "about 2", "about 6", "about 5"],
      });
      verifyObjectDetailPreview({
        rowNumber: 8,
        row: ["Quantity", "about 2"],
      });

      cy.log("verify viz");
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
      visitFn({
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

  describe("Preview section", () => {
    describe("Esc key", () => {
      it("should allow closing the preview with Esc key", () => {
        visitFn({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        PreviewSection.get().should("not.exist");

        FieldSection.getPreviewButton().click();
        PreviewSection.get().should("be.visible");

        cy.realPress("Escape");
        PreviewSection.get().should("not.exist");
      });

      it("should not close the preview when hitting Esc key while modal is open", () => {
        visitFn({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        FieldSection.getPreviewButton().click();
        PreviewSection.get().should("be.visible");

        TableSection.getSyncOptionsButton().click();
        H.modal().should("be.visible");

        cy.realPress("Escape");
        H.modal().should("not.exist");
        PreviewSection.get().should("be.visible");

        FieldSection.getFieldValuesButton().click();
        H.modal().should("be.visible");

        cy.realPress("Escape");
        H.modal().should("not.exist");
        PreviewSection.get().should("be.visible");
      });
    });

    describe("Focus and safety", () => {
      it("should not close the preview when hitting Esc key while popover is open", () => {
        visitFn({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        FieldSection.getPreviewButton().click();
        PreviewSection.get().should("be.visible");

        FieldSection.getSemanticTypeInput().click();
        H.popover().should("be.visible");

        cy.realPress("Escape");
        H.popover({ skipVisibilityCheck: true }).should("not.be.visible");
        PreviewSection.get().should("be.visible");
      });

      it("should not close the preview when hitting Esc key while command palette is open", () => {
        visitFn({
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

      it("should not auto-focus inputs in filtering preview", () => {
        visitFn({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        FieldSection.getPreviewButton().click();
        PreviewSection.getPreviewTypeInput().findByText("Filtering").click();

        PreviewSection.get()
          .findByPlaceholderText("Enter an ID")
          .should("be.visible")
          .and("not.be.focused");

        FieldSection.getFilteringInput().click();
        H.popover().findByText("A list of all values").click();

        PreviewSection.get()
          .findByPlaceholderText("Search the list")
          .should("be.visible")
          .and("not.be.focused");

        TableSection.clickField("Tax");

        PreviewSection.get()
          .findByPlaceholderText("Min")
          .should("be.visible")
          .and("not.be.focused");

        FieldSection.getFilteringInput().click();
        H.popover().findByText("Search box").click();

        PreviewSection.get()
          .findByPlaceholderText("Enter a number")
          .should("be.visible")
          .and("not.be.focused");
      });
    });

    describe("Empty states", { tags: "@external" }, () => {
      beforeEach(() => {
        H.restore("postgres-writable");
        H.resetTestTable({ type: "postgres", table: "multi_schema" });
        H.resyncDatabase({ dbId: WRITABLE_DB_ID });
        H.queryWritableDB('delete from "Domestic"."Animals"');
      });

      it("should show empty state when there is no data", () => {
        visitFn({});

        TablePicker.getDatabase("Writable Postgres12").click();
        TablePicker.getSchema("Domestic").click();
        TablePicker.getTable("Animals").click();
        TableSection.clickField("Name");
        FieldSection.getPreviewButton().click();

        PreviewSection.get().findByText("No data to show").should("be.visible");
        PreviewSection.getPreviewTypeInput().findByText("Detail").click();
        PreviewSection.get().findByText("No data to show").should("be.visible");
      });
    });
  });

  describe("Semantic types and foreign keys", () => {
    it("should allow to change the foreign key target", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.USER_ID,
      });

      FieldSection.getSemanticTypeFkTarget()
        .should("have.value", "People → ID")
        .click();
      H.popover().within(() => {
        cy.findByText("Reviews → ID").should("be.visible");
        cy.findByText("Products → ID").should("be.visible");
        cy.findByText("People → ID").should("be.visible");
        cy.findByText("Orders → ID").should("not.exist");
      });
    });

    it("should allow to change the type to 'Currency' and choose the currency (metabase#59052)", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
      });

      FieldSection.getSemanticTypeInput().should("have.value", "No semantic type").click();
      H.popover().findByText("Currency").click();
      cy.wait("@updateField");
      verifyAndCloseToast("Semantic type of Tax updated");

      cy.log("verify preview");
      TableSection.clickField("Tax");
      FieldSection.getPreviewButton().click();
      verifyTablePreview({
        column: "Tax ($)",
        values: ["2.07", "6.10", "2.90", "6.01", "7.03"],
      });
      verifyObjectDetailPreview({
        rowNumber: 4,
        row: ["Tax ($)", "2.07"],
      });

      cy.log("change currency");
      FieldSection.getSemanticTypeCurrencyInput()
        .scrollIntoView()
        .should("be.visible")
        .and("have.value", "US Dollar")
        .type("canadian{downarrow}{enter}");
      cy.wait("@updateField");
      verifyAndCloseToast("Semantic type of Tax updated");

      cy.log("verify preview");
      verifyTablePreview({
        column: "Tax (CA$)",
        values: ["2.07", "6.10", "2.90", "6.01", "7.03"],
      });
      verifyObjectDetailPreview({
        rowNumber: 4,
        row: ["Tax (CA$)", "2.07"],
      });

      cy.log("verify viz");
      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Tax (CA$)").should("be.visible");
    });

    it("should allow to change the type to 'No semantic type' (metabase#59052)", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.PRODUCT_ID,
      });
      cy.wait(["@metadata", "@metadata"]);

      FieldSection.getSemanticTypeInput()
        .should("have.value", "Foreign Key")
        .type("no sema{downarrow}{enter}");
      cy.wait("@updateField");
      if (trackingSource) {
        H.expectUnstructuredSnowplowEvent({
          event: "metadata_edited",
          event_detail: "semantic_type_change",
          triggered_from: trackingSource,
        });
      }
      verifyAndCloseToast("Semantic type of Product ID updated");

      cy.log("should allow to just type to search (metabase#59052)");
      TableSection.clickField("Tax");
      FieldSection.getSemanticTypeInput().click().type("no sema{downarrow}{enter}");
      cy.wait("@updateField");
      verifyAndCloseToast("Semantic type of Tax updated");
    });

    it("should allow to map FK to date fields (metabase#7108)", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.USER_ID,
      });

      FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Use foreign key").click();
      cy.wait("@updateFieldDimension");
      verifyAndCloseToast("Display values of User ID updated");

      TablePicker.getTable("People").click();
      TableSection.clickField("Birthday");
      FieldSection.getSemanticTypeInput().should("have.value", "No semantic type");
      FieldSection.getSemanticTypeInput().click();
      H.popover().findByText("Birthdate").click();
      cy.wait("@updateField");
      verifyAndCloseToast("Semantic type of Birthday updated");

      TablePicker.getTable("Orders").click();
      TableSection.clickField("User ID");
      FieldSection.getDisplayValuesFkTargetInput().click();
      H.popover().findByText("Birthday").click();
      cy.wait("@updateFieldDimension");
      verifyAndCloseToast("Display values of User ID updated");

      verifyTablePreview({
        column: "User ID",
        values: ["2018-04-02", "2017-09-08", "2020-01-06", "2018-07-04", "2019-04-19"],
      });
      verifyObjectDetailPreview({
        rowNumber: 4,
        row: ["User ID", "2018-04-02"],
      });
    });
  });

  describe("Layout", () => {
    it("should not overflow the screen on smaller viewports (metabase#56442)", () => {
      const viewportHeight = 400;

      cy.viewport(1280, viewportHeight);
      visitFn({ databaseId: SAMPLE_DB_ID });
      TablePicker.getTable("Reviews").scrollIntoView().click();
      TableSection.clickField("ID");
      FieldSection.getSemanticTypeInput().click();

      H.popover().scrollTo("top");
      H.popover()
        .findByText("Entity Key")
        .should(($element) => {
          const rect = $element[0].getBoundingClientRect();
          expect(rect.top).greaterThan(0);
          expect(rect.bottom).lessThan(viewportHeight);
        });
    });
  });

  describe("Undos", { tags: "@external" }, () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "many_data_types" });
      cy.signInAsAdmin();
      H.resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: "many_data_types",
      });
    });

    it("allows to undo every action", () => {
      visitFn({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });

      cy.log("table section");

      cy.log("name");
      TableSection.getNameInput().type("a").blur();
      verifyToastAndUndo("Table name updated");
      TableSection.getNameInput().should("have.value", "Orders");

      cy.log("description");
      TableSection.getDescriptionInput().type("a").blur();
      verifyToastAndUndo("Table description updated");
      TableSection.getDescriptionInput().should(
        "have.value",
        "Confirmed Sample Company orders for a product, from a user.",
      );

      cy.log("predefined field order");
      TableSection.getSortButton().click();
      TableSection.getSortOrderInput()
        .findByLabelText("Alphabetical order")
        .click();
      verifyToastAndUndo("Field order updated");
      TableSection.getSortOrderInput()
        .findByDisplayValue("database")
        .should("be.checked");

      cy.log("custom field order");
      H.moveDnDKitElement(TableSection.getSortableField("ID"), {
        vertical: 50,
      });
      verifyToastAndUndo("Field order updated");
      TableSection.getSortOrderInput()
        .findByDisplayValue("database")
        .should("be.checked");
      TableSection.get().button("Done").click();

      cy.log("field name");
      TableSection.getFieldNameInput("Quantity").type("a").blur();
      verifyToastAndUndo("Name of Quantity updated");
      TableSection.getFieldNameInput("Quantity").should(
        "have.value",
        "Quantity",
      );

      cy.log("field description");
      TableSection.getFieldDescriptionInput("Quantity").type("a").blur();
      verifyToastAndUndo("Description of Quantity updated");
      TableSection.getFieldDescriptionInput("Quantity").should(
        "have.value",
        "Number of products bought.",
      );

      cy.log("field section");

      cy.log("name");
      FieldSection.getNameInput().type("a").blur();
      verifyToastAndUndo("Name of Quantity updated");
      FieldSection.getNameInput().should("have.value", "Quantity");

      cy.log("description");
      FieldSection.getDescriptionInput().type("a").blur();
      verifyToastAndUndo("Description of Quantity updated");
      FieldSection.getDescriptionInput().should(
        "have.value",
        "Number of products bought.",
      );

      cy.log("coercion strategy");
      FieldSection.getCoercionToggle().parent().scrollIntoView().click();
      H.popover()
        .findByText("UNIX seconds → Datetime")
        .scrollIntoView()
        .click();
      verifyToastAndUndo("Casting enabled for Quantity");
      FieldSection.getCoercionToggle().should("not.be.checked");

      cy.log("semantic type");
      FieldSection.getSemanticTypeInput().click();
      H.popover().findByText("Score").click();
      verifyToastAndUndo("Semantic type of Quantity updated");
      FieldSection.getSemanticTypeInput().should("have.value", "Quantity");

      cy.log("visibility");
      FieldSection.getVisibilityInput().click();
      H.popover().findByText("Only in detail views").click();
      verifyToastAndUndo("Visibility of Quantity updated");
      FieldSection.getVisibilityInput().should("have.value", "Everywhere");

      cy.log("filtering");
      FieldSection.getFilteringInput().click();
      H.popover().findByText("Search box").click();
      verifyToastAndUndo("Filtering of Quantity updated");
      FieldSection.getFilteringInput().should(
        "have.value",
        "A list of all values",
      );

      cy.log("display values");
      FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Custom mapping").click();
      H.modal().should("be.visible");
      H.modal().button("Close").click();
      verifyToastAndUndo("Display values of Quantity updated");
      FieldSection.getDisplayValuesInput().should(
        "have.value",
        "Use original value",
      );

      cy.log("custom mapping");
      FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Custom mapping").click();
      verifyAndCloseToast("Display values of Quantity updated");
      H.modal().within(() => {
        cy.findByDisplayValue("0")
          .clear()
          .type("XYZ", { scrollBehavior: "center" })
          .blur();
        cy.button("Save").click();
      });
      verifyToastAndUndo("Display values of Quantity updated");
      FieldSection.get().button("Edit mapping").click();
      H.modal().within(() => {
        cy.findByDisplayValue("0").should("be.visible");
        cy.findByDisplayValue("XYZ").should("not.exist");
        cy.button("Close").click();
      });

      cy.log("foreign key");
      TableSection.clickField("User ID");
      FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Use foreign key").click();
      verifyToastAndUndo("Display values of User ID updated");
      FieldSection.getDisplayValuesInput().should(
        "have.value",
        "Use original value",
      );

      cy.log("JSON unfolding");
      TablePicker.getDatabase("Writable Postgres12").click();
      TablePicker.getTable("Many Data Types").click();
      TableSection.clickField("Json");
      FieldSection.getUnfoldJsonInput().click();
      H.popover().findByText("No").click();
      verifyToastAndUndo("JSON unfolding disabled for Json");
      FieldSection.getUnfoldJsonInput().should("have.value", "Yes");

      cy.log("formatting");
      TablePicker.getTable("Orders").click();
      TableSection.clickField("Quantity");

      cy.log("prefix (ChartSettingInput)");
      FieldSection.getPrefixInput().type("5").blur();
      verifyToastAndUndo("Formatting of Quantity updated");
      FieldSection.getPrefixInput().should("have.value", "");

      cy.log("multiply by number (ChartSettingInputNumeric)");
      FieldSection.getMultiplyByNumberInput().type("5").blur();
      verifyToastAndUndo("Formatting of Quantity updated");
      FieldSection.getMultiplyByNumberInput().should("have.value", "");

      cy.log("mini bar chart (ChartSettingToggle)");
      FieldSection.getMiniBarChartToggle()
        .parent()
        .click({ scrollBehavior: "center" });
      verifyToastAndUndo("Formatting of Quantity updated");
      FieldSection.getMiniBarChartToggle().should("not.be.checked");
    });
  });
}
