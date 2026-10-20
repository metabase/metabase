import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NODATA_USER_ID } from "e2e/support/cypress_sample_instance_data";
import type { TableId } from "metabase-types/api";

const { H } = cy;
const { TablePicker, TableSection, FieldSection, PreviewSection } = H.DataModel;

const { ORDERS, ORDERS_ID, PRODUCTS_ID, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("scenarios > data studio > datamodel", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.intercept("POST", "/api/dataset*").as("dataset");
    cy.intercept("GET", "/api/table?*").as("listTables");
    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("PUT", "/api/table/*/fields/order").as("updateFieldOrder");
    cy.intercept("POST", "/api/field/*/values").as("updateFieldValues");
    cy.intercept("POST", "/api/field/*/dimension").as("updateFieldDimension");
    cy.intercept("PUT", "/api/table/*").as("updateTable");
  });

  describe("Table picker", () => {
    describe("Filtering", () => {
      it("should filter tables by owner and source", () => {
        const OWNER_EMAIL = "owner-filter@example.com";

        cy.request("GET", "/api/user/current")
          .its("body")
          .then(({ id, common_name }) => {
            cy.wrap(common_name).as("ownerName");
            return updateTableAttributes({
              databaseId: SAMPLE_DB_ID,
              displayName: "Orders",
              attributes: { owner_user_id: id, data_source: "upload" },
            }).as("ordersTableId");
          });

        updateTableAttributes({
          databaseId: SAMPLE_DB_ID,
          displayName: "Products",
          attributes: { data_source: "ingested" },
        }).as("productsTableId");

        H.DataModel.visitDataStudio();
        cy.get<TableId>("@ordersTableId").then(expectTableVisible);
        cy.get<TableId>("@productsTableId").then(expectTableVisible);

        cy.log("filter by unspecified owner");
        TablePicker.openFilterPopover();
        TablePicker.selectFilterOption("Owner", "Unspecified");
        TablePicker.applyFilters();

        cy.get<TableId>("@productsTableId").then(expectTableVisible);
        cy.get<TableId>("@ordersTableId").then(expectTableNotVisible);

        cy.log("filter by owner user");
        H.DataModel.visitDataStudio();
        TablePicker.openFilterPopover();
        cy.get<string>("@ownerName").then((ownerName) => {
          selectOwnerByName(ownerName);
        });
        TablePicker.applyFilters();

        cy.get<TableId>("@ordersTableId").then(expectTableVisible);
        cy.get<TableId>("@productsTableId").then(expectTableNotVisible);

        cy.log("filter by source");
        H.DataModel.visitDataStudio();
        TablePicker.openFilterPopover();
        TablePicker.selectFilterOption("Source", "Uploaded data");
        TablePicker.applyFilters();

        cy.get<TableId>("@ordersTableId").then(expectTableVisible);
        cy.get<TableId>("@productsTableId").then(expectTableNotVisible);

        cy.log("filter by owner email");
        updateTableAttributes({
          databaseId: SAMPLE_DB_ID,
          displayName: "Orders",
          attributes: { owner_email: OWNER_EMAIL, owner_user_id: null },
        });
        H.DataModel.visitDataStudio();
        TablePicker.openFilterPopover();
        selectOwnerByEmail(OWNER_EMAIL);
        TablePicker.applyFilters();

        cy.get<TableId>("@ordersTableId").then(expectTableVisible);
        cy.get<TableId>("@productsTableId").then(expectTableNotVisible);
      });
    });
  });

  describe("Table section", () => {
    describe("Name and description", () => {
      it("should allow analysts to edit all table metadata even without data access", () => {
        H.setUserAsAnalyst(NODATA_USER_ID);

        cy.signIn("nodata");
        H.DataModel.visitDataStudio({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        cy.log("change table name");
        TableSection.getNameInput().clear().type("Analyst Orders").blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table name updated");
        TableSection.getNameInput().should("have.value", "Analyst Orders");

        cy.log("change table description");
        TableSection.getDescriptionInput()
          .clear()
          .type("Description by analyst")
          .blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table description updated");
        TableSection.getDescriptionInput().should(
          "have.value",
          "Description by analyst",
        );

        cy.log("change field name");
        TableSection.clickFieldsTab();
        TableSection.getFieldNameInput("Tax")
          .clear()
          .type("Analyst Tax")
          .blur();
        cy.wait("@updateField");
        verifyAndCloseToast("Name of Tax updated");
        TableSection.getFieldNameInput("Analyst Tax").should("be.visible");
        TableSection.getField("Analyst Tax").should("be.visible");

        cy.log("change field description");
        TableSection.getFieldDescriptionInput("Total")
          .clear()
          .type("Total edited by analyst")
          .blur();
        cy.wait("@updateField");
        verifyAndCloseToast("Description of Total updated");
        TableSection.getFieldDescriptionInput("Total").should(
          "have.value",
          "Total edited by analyst",
        );

        cy.log("navigate to field detail and change semantic type");
        TableSection.clickField("Discount");
        FieldSection.getSemanticTypeInput()
          .should("have.value", "Discount")
          .click();
        H.popover().findByText("Currency").click();
        cy.wait("@updateField");
        verifyAndCloseToast("Semantic type of Discount updated");
        FieldSection.getSemanticTypeInput().should("have.value", "Currency");

        cy.log("verify table preview is blocked without data permissions");
        FieldSection.getPreviewButton().click();
        cy.wait("@dataset");
        PreviewSection.get()
          .findByText("Sorry, you don’t have permission to see that.")
          .should("be.visible");

        cy.log("verify detail preview is also blocked");
        PreviewSection.getPreviewTypeInput().findByText("Detail").click();
        cy.wait("@dataset");
        PreviewSection.get()
          .findByText("Sorry, you don’t have permission to see that.")
          .should("be.visible");

        cy.log("verify changes in data reference as admin");
        cy.signInAsAdmin();

        H.DataModel.visitDataStudio({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });
        cy.log("snowplow event when dependency graph link is clicked");
        TableSection.getDependencyGraphLink().click();
        H.expectUnstructuredSnowplowEvent({
          event: "dependency_entity_selected",
          triggered_from: "data-structure",
          event_detail: "table",
        });

        cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
        cy.get("main").within(() => {
          cy.findByText("Analyst Orders").should("be.visible");
          cy.findByText("Description by analyst").should("be.visible");
        });

        cy.visit(
          `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
        );
        cy.get("main").within(() => {
          cy.findByText("Total").should("be.visible");
          cy.findByText("Total edited by analyst").should("be.visible");
        });

        cy.log("verify changes in question picker as normal user");
        cy.signInAsNormalUser();
        H.startNewQuestion();
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("People").should("be.visible");
          cy.findByText("Analyst Orders").should("be.visible");
        });

        cy.log("verify field changes in table visualization");
        H.openOrdersTable();
        H.tableHeaderColumn("Analyst Tax").should("be.visible");
        H.tableHeaderColumn("Tax", { scrollIntoView: false }).should(
          "not.exist",
        );
        H.tableHeaderColumn("Discount ($)").should("be.visible");
      });
    });

    describe("Sorting", () => {
      it("should allow sorting fields as in the database, by drag & drop with a switch back to a predefined order (metabase#56482), alphabetically, and smartly", () => {
        cy.log("database order");
        H.DataModel.visitDataStudio({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.clickFieldsTab();
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

        cy.log("drag & drop order");
        H.DataModel.visitDataStudio({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.clickFieldsTab();
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

        cy.log("should use the custom order in the query builder");
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

        cy.log("alphabetical order");
        H.DataModel.visitDataStudio({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.clickFieldsTab();
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

        cy.log("smart order");
        H.DataModel.visitDataStudio({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.clickFieldsTab();
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
    });
  });

  describe("Field section", () => {
    beforeEach(() => {
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should allow analysts without data access to change field metadata but not set up custom mapping", () => {
      H.setUserAsAnalyst(NODATA_USER_ID);
      cy.signIn("nodata");

      cy.log("change the foreign key target as analyst");
      H.DataModel.visitDataStudio({
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
        cy.findByText("Products → ID").click();
      });
      cy.wait("@updateField");
      H.undoToast().should("contain.text", "Semantic type of User ID updated");
      FieldSection.getSemanticTypeFkTarget().should(
        "have.value",
        "Products → ID",
      );

      cy.log("verify preview is blocked without data permissions");
      FieldSection.getPreviewButton().click();
      cy.wait("@dataset");
      PreviewSection.get()
        .findByText("Sorry, you don’t have permission to see that.")
        .should("be.visible");

      cy.log("change display values to use foreign key as analyst");
      H.DataModel.visitDataStudio({
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

      FieldSection.getDisplayValuesInput().should(
        "have.value",
        "Use foreign key",
      );
      FieldSection.getDisplayValuesFkTargetInput().should(
        "have.value",
        "Title",
      );

      cy.log("verify preview is blocked without data permissions");
      FieldSection.getPreviewButton().click();
      cy.wait("@dataset");
      PreviewSection.get()
        .findByText("Sorry, you don’t have permission to see that.")
        .should("be.visible");

      cy.log("verify custom mapping is disabled without data access");
      H.DataModel.visitDataStudio({
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

      cy.log("verify admin can set up custom mapping");
      cy.signInAsAdmin();
      H.DataModel.visitDataStudio({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: REVIEWS_ID,
        fieldId: REVIEWS.RATING,
      });
      FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Custom mapping").click();
      cy.wait("@updateFieldValues");
      H.undoToast().should("contain.text", "Display values of Rating updated");
      H.undoToast().icon("close").click({ force: true });

      H.modal().within(() => {
        cy.findByDisplayValue("1").click().clear().type("Terrible");
        cy.findByDisplayValue("5").click().clear().type("Amazing");
        cy.button("Save").click();
      });
      cy.wait("@updateFieldValues");
      H.undoToast().should("contain.text", "Display values of Rating updated");

      cy.log("verify FK target change works in query builder as normal user");
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

      cy.log("verify display value change works as normal user");
      H.openReviewsTable({ limit: 1 });
      H.main().findByText("Rustic Paper Wallet").should("be.visible");

      cy.log("verify custom mapping works as normal user");
      H.openReviewsTable();
      H.main().findByText("Terrible").should("be.visible");
      H.main().findAllByText("Amazing").should("be.visible");
    });
  });

  describe("Preview section", () => {
    it("should close the preview with Esc key only when no overlay is open, and not auto-focus inputs in filtering preview", () => {
      H.DataModel.visitDataStudio({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.PRODUCT_ID,
      });

      cy.log("close the preview with Esc key");
      PreviewSection.get().should("not.exist");

      FieldSection.getPreviewButton().click();
      PreviewSection.get().scrollIntoView().should("be.visible");

      cy.realPress("Escape");
      PreviewSection.get().should("not.exist");

      cy.log("do not close the preview with Esc key while modal is open");
      FieldSection.getPreviewButton().click();
      PreviewSection.get().scrollIntoView().should("be.visible");

      FieldSection.getFieldValuesButton().click();
      H.modal().should("be.visible");

      cy.realPress("Escape");
      H.modal().should("not.exist");
      PreviewSection.get().should("be.visible");

      cy.log(
        "do not close the preview with Esc key while command palette is open",
      );
      H.openCommandPalette();
      H.commandPalette().should("be.visible");

      cy.realPress("Escape");
      H.commandPalette().should("not.exist");
      PreviewSection.get().should("be.visible");

      cy.log("do not close the preview with Esc key while popover is open");
      FieldSection.getSemanticTypeInput().click();
      H.popover().should("be.visible");

      cy.realPress("Escape");
      H.popover({ skipVisibilityCheck: true }).should("not.be.visible");
      PreviewSection.get().scrollIntoView().should("be.visible");

      cy.log("do not auto-focus inputs in filtering preview");
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

  it("should allow you to close table and field details, clear a field description, and use sync options, also for a hidden table", () => {
    H.DataModel.visitDataStudio({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });

    FieldSection.getPreviewButton().click({ scrollBehavior: "center" });

    PreviewSection.get().should("exist");

    FieldSection.getCloseButton().click();

    PreviewSection.get().should("not.exist");
    FieldSection.get().should("not.exist");
    TableSection.get().should("exist");

    TableSection.getCloseButton().click();
    TableSection.get().should("not.exist");

    cy.log(
      "ensure that preview opened state was cleared and does not re-appear",
    );
    TablePicker.getTable("Orders").click();
    TableSection.clickFieldsTab();
    TableSection.clickField("Subtotal");
    FieldSection.getNameInput().should("have.value", "Subtotal");
    PreviewSection.get().should("not.exist");
    FieldSection.get().should("exist");
    TableSection.get().should("exist");

    cy.log("clear the field description");
    H.DataModel.visitDataStudio({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
    });

    TableSection.clickFieldsTab();
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
    H.hovercard()
      .should("contain.text", "No description")
      .and("not.contain.text", "The total billed amount.");

    cy.visit(
      `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
    );
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Total").should("be.visible");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No description yet").should("be.visible");

    cy.log("sync options from the actions menu");
    cy.intercept("POST", "/api/data-studio/table/sync-schema").as("syncSchema");
    cy.intercept("POST", "/api/data-studio/table/rescan-values").as(
      "rescanValues",
    );
    cy.intercept("POST", "/api/data-studio/table/discard-values").as(
      "discardValues",
    );

    H.DataModel.visitDataStudio({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: PRODUCTS_ID,
    });

    cy.log("re-sync schema");
    TableSection.getActionsMenuButton().click();
    H.menu().findByText("Re-sync schema").click();
    cy.wait("@syncSchema");
    verifyAndCloseToast("Sync triggered");

    cy.log("re-scan field values");
    TableSection.getActionsMenuButton().click();
    H.menu().findByText("Re-scan field values").click();
    cy.wait("@rescanValues");
    verifyAndCloseToast("Scan triggered");

    cy.log("discard cached field values");
    TableSection.getActionsMenuButton().click();
    H.menu().findByText("Discard cached field values").click();
    cy.wait("@discardValues");
    verifyAndCloseToast("Discard triggered");

    cy.log("should not crash when viewing filtering preview of a hidden table");
    H.DataModel.visitDataStudio({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
    });

    TableSection.clickDetailsTab();
    TableSection.getVisibilityTypeInput().click();
    H.popover().findByText("Hidden").click();
    cy.wait("@updateTable");

    TableSection.clickFieldsTab();
    TableSection.clickField("Product ID");

    FieldSection.getPreviewButton().click();
    PreviewSection.getPreviewTypeInput().findByText("Filtering").click();
    PreviewSection.get()
      .findByPlaceholderText("Enter an ID")
      .should("be.visible");
    H.main().findByText("Something’s gone wrong").should("not.exist");
  });
});

describe(
  "scenarios > data studio > datamodel > preview empty states",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      H.resetTestTable({ type: "postgres", table: "multi_schema" });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });
      H.queryWritableDB('delete from "Domestic"."Animals"');
    });

    it("should show empty state when there is no data", () => {
      H.DataModel.visitDataStudio();

      TablePicker.getDatabase("Writable Postgres12").click();
      TablePicker.getSchema("Domestic").click();
      TablePicker.getTable("Animals").click();
      TableSection.clickFieldsTab();
      TableSection.clickField("Name");
      FieldSection.getPreviewButton().click();

      PreviewSection.get()
        .scrollIntoView()
        .findByText("No data to show")
        .should("be.visible");
      PreviewSection.getPreviewTypeInput().findByText("Detail").click();
      PreviewSection.get().findByText("No data to show").should("be.visible");
    });
  },
);

type TableSummary = {
  id: TableId;
  db_id: number;
  display_name: string;
  name: string;
  estimated_row_count?: number | null;
};

type TableLookup = {
  databaseId: number;
  displayName?: string;
  name?: string;
};

function selectOwnerByName(ownerLabel: string) {
  cy.findByRole("textbox", { name: "Owner" }).click();
  H.popover().contains(ownerLabel).click();
}

function selectOwnerByEmail(email: string) {
  cy.findByRole("textbox", { name: "Owner" }).clear().type(email);
  H.popover().contains(email).click();
}

function expectTableVisible(tableId: TableId) {
  findSearchResultByTableId(tableId).should("exist");
}

function expectTableNotVisible(tableId: TableId) {
  findSearchResultByTableId(tableId).should("not.exist");
}

function findSearchResultByTableId(tableId: TableId) {
  return cy.findAllByTestId("tree-item").filter(`[data-table-id="${tableId}"]`);
}

function getTableId({
  databaseId,
  displayName,
  name,
}: TableLookup): Cypress.Chainable<TableId> {
  if (!displayName && !name) {
    throw new Error("displayName or name must be provided");
  }

  return cy.request<TableSummary[]>("/api/table").then(({ body }) => {
    const table = body.find((candidate) => {
      if (candidate.db_id !== databaseId) {
        return false;
      }

      if (displayName && candidate.display_name === displayName) {
        return true;
      }

      if (name && candidate.name === name) {
        return true;
      }

      return false;
    });

    if (!table) {
      throw new Error(
        `Table not found for database ${databaseId} (${displayName ?? name})`,
      );
    }

    return table.id;
  });
}

function updateTableAttributes({
  databaseId,
  displayName,
  name,
  attributes,
}: TableLookup & {
  attributes: Record<string, unknown>;
}): Cypress.Chainable<TableId> {
  return getTableId({ databaseId, displayName, name }).then((tableId) => {
    return cy
      .request("POST", "/api/data-studio/table/edit", {
        table_ids: [tableId],
        ...attributes,
      })
      .then(() => tableId);
  });
}

function verifyAndCloseToast(message: string) {
  H.undoToast().should("contain.text", message);
  H.undoToast().icon("close").click({ force: true });
}

function verifyTablePreview({
  column,
  values,
}: {
  column: string;
  values: string[];
}) {
  PreviewSection.getPreviewTypeInput().findByText("Table").click();
  cy.wait("@dataset");

  PreviewSection.get().within(() => {
    H.assertTableData({
      columns: [column],
      firstRows: values.map((value) => [value]),
    });
  });
}
