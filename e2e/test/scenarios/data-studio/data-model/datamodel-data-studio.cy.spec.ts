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
      it("should allow sorting fields by drag & drop with a switch back to a predefined order (metabase#56482), and use the custom order in the query builder", () => {
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
});

describe("scenarios > data studio > datamodel > table editing", () => {
  beforeEach(() => {
    H.resetSnowplow();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
    cy.intercept("PUT", "/api/table/*").as("updateTable");
    cy.intercept("POST", "/api/data-studio/table/sync-schema").as("syncSchema");
    cy.intercept("POST", "/api/data-studio/table/rescan-values").as(
      "rescanValues",
    );
    cy.intercept("POST", "/api/data-studio/table/discard-values").as(
      "discardValues",
    );
    cy.intercept("POST", "/api/ee/data-studio/table/publish-tables").as(
      "publishTables",
    );
    cy.intercept("POST", "/api/ee/data-studio/table/unpublish-tables").as(
      "unpublishTables",
    );
  });

  it(
    "syncs, edits attributes, publishes and unpublishes multiple tables",
    { tags: ["@external"] },
    () => {
      // Not `postgres-writable`: restoring it empties the warehouse but keeps
      // the old table metadata, so any sync deactivates the tables we use here.
      H.restore("postgres-12");
      H.activateToken("pro-self-hosted");
      H.DataModel.visitDataStudio();
      TablePicker.expandDatabase("QA Postgres12");

      getTreeTableId("Orders").then((ordersTableId) => {
        getTreeTableId("Products").then((productsTableId) => {
          cy.wrap([ordersTableId, productsTableId]).as("tableIds");
        });
      });

      TablePicker.getTable("Orders").find('input[type="checkbox"]').check();
      TablePicker.getTable("Products").find('input[type="checkbox"]').check();
      cy.findByRole("heading", { name: /2 tables selected/ });

      cy.findByRole("button", { name: /Sync settings/ }).click();
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_bulk_sync_settings_clicked",
      });
      cy.findByRole("button", { name: /Sync table schemas/ }).click();
      cy.findByRole("button", { name: /Sync triggered!/ }).should("be.visible");
      cy.get<number[]>("@tableIds").then((tableIds) => {
        cy.wait<TablesActionRequest, TablesActionsResponse>("@syncSchema").then(
          ({ request, response }) => {
            expect(request.body.table_ids).to.deep.eq(tableIds);
            expect(response?.statusCode).to.eq(204);
          },
        );
      });
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_table_schema_sync_started",
        result: "success",
      });

      cy.findByRole("button", { name: /Re-scan tables/ }).click();
      cy.findByRole("button", { name: /Scan triggered!/ }).should("be.visible");

      cy.get<number[]>("@tableIds").then((tableIds) => {
        cy.wait<TablesActionRequest, TablesActionsResponse>(
          "@rescanValues",
        ).then(({ request, response }) => {
          expect(request.body.table_ids).to.deep.eq(tableIds);
          expect(response?.statusCode).to.eq(204);
        });
      });
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_table_fields_rescan_started",
        result: "success",
      });

      cy.findByRole("button", { name: /Discard cached field values/ }).click();
      cy.findByRole("button", { name: /Discard triggered!/ }).should(
        "be.visible",
      );
      cy.get<number[]>("@tableIds").then((tableIds) => {
        cy.wait<TablesActionRequest, TablesActionsResponse>(
          "@discardValues",
        ).then(({ request, response }) => {
          expect(request.body.table_ids).to.deep.eq(tableIds);
          expect(response?.statusCode).to.eq(204);
        });
      });
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_table_field_values_discard_started",
        result: "success",
      });

      H.modal().should("be.visible");
      cy.realPress("Escape");
      H.modal().should("not.exist");

      cy.log("edit attributes for multiple tables");
      H.selectHasValue("Owner", "").click();
      H.selectDropdown().contains("Bobby Tables").click();
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_bulk_attribute_updated",
        event_detail: "owner",
        result: "success",
      });

      H.selectHasValue("Visibility layer", "").click();
      H.selectDropdown().contains("Final").click();
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_bulk_attribute_updated",
        event_detail: "layer",
        result: "success",
      });

      H.selectHasValue("Entity type", "").click();
      H.selectDropdown().contains("Person").click();
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_bulk_attribute_updated",
        event_detail: "entity_type",
        result: "success",
      });

      H.selectHasValue("Source", "").click();
      H.selectDropdown().contains("Ingested").click();
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_bulk_attribute_updated",
        event_detail: "data_source",
        result: "success",
      });
      H.undoToastList().should("have.length", 4);
      TablePicker.getTable("Orders")
        .findByTestId("table-owner")
        .should("have.text", "Bobby Tables");
      TablePicker.getTable("Products")
        .findByTestId("table-owner")
        .should("have.text", "Bobby Tables");

      cy.log("publish and unpublish multiple tables");
      TablePicker.getTable("Orders")
        .findByRole("checkbox")
        .scrollIntoView()
        .check();
      TablePicker.getTable("Products")
        .findByRole("checkbox")
        .scrollIntoView()
        .check();
      TablePicker.getTable("Reviews")
        .findByRole("checkbox")
        .scrollIntoView()
        .check();

      cy.log("publish the tables and verify they are published");
      cy.findByRole("button", { name: /Publish/ }).click();
      H.modal().findByText("Create my semantic layer").click();
      H.modal().findByText("Publish these tables").click();
      cy.wait("@publishTables");
      H.undoToastListContainer().within(() => {
        cy.findByText("Published").should("be.visible");
        cy.findByRole("button", { name: /Go to Data/ }).click();
      });
      H.DataStudio.Library.tableItem("Orders").should("be.visible");
      H.DataStudio.Library.tableItem("Products").should("be.visible");
      cy.go("back");

      cy.log("unpublish some tables and verify they are unpublished");
      TablePicker.getTable("Orders")
        .findByRole("checkbox")
        .scrollIntoView()
        .check();
      TablePicker.getTable("Products")
        .findByRole("checkbox")
        .scrollIntoView()
        .check();
      cy.findByRole("button", { name: /Unpublish/ }).click();
      H.modal().findByText("Unpublish these tables").click();
      cy.wait("@unpublishTables");
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_table_unpublished",
      });
      H.DataStudio.nav().findByLabelText("Semantic layer").click();

      H.DataStudio.Library.libraryPage().within(() => {
        cy.findByText("Reviews").should("be.visible");
        cy.findByText("Orders").should("not.exist");
        cy.findByText("Products").should("not.exist");
      });
    },
  );

  it(
    "should display metadata information and publish and unpublish a single table",
    { tags: ["@external"] },
    () => {
      H.restore("mysql-8");
      H.activateToken("pro-self-hosted");
      H.DataModel.visitDataStudio();
      TablePicker.getDatabase("QA MySQL8").click();
      TablePicker.getTable("Orders").click();

      cy.log("display metadata information");
      cy.wait<MetadataResponse>("@metadata").then(({ response }) => {
        const viewCount = response?.body.view_count ?? 0;

        cy.findByLabelText("Name in the database").should(
          "have.text",
          "ORDERS",
        );
        cy.findByLabelText("Last updated at").should("exist"); // Testing the actual value is done in TableMetadata.unit.spec.tsx
        cy.findByLabelText("View count").should("have.text", viewCount);
        cy.findByLabelText("Est. row count").should("not.exist");
        cy.findByLabelText("Dependencies").should("have.text", "0");
        cy.findByLabelText("Dependents").should("have.text", "0");

        H.DataModel.TableSection.get()
          .findByRole("link", { name: "Dependency graph" })
          .click();

        H.DataStudio.Dependencies.graph().should("be.visible");
      });
      cy.go("back");
      H.DataModel.TableSection.getNameInput().should("have.value", "Orders");

      cy.log("publish the table and verify it's published");
      TablePicker.getTable("Orders")
        .findByTestId("table-published")
        .should("not.exist");
      cy.findByRole("button", { name: /Publish/ }).click();
      H.modal().findByText("Create my semantic layer").click();
      H.modal().findByText("Publish this table").click();
      cy.wait("@publishTables");
      TablePicker.getTable("Orders")
        .findByTestId("table-published")
        .should("be.visible");
      H.undoToastListContainer().within(() => {
        cy.findByText("Published").should("be.visible");
        cy.findByRole("button", { name: /Go to Data/ }).click();
      });
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_table_published",
      });
      H.DataStudio.Library.tableItem("Orders").should("be.visible");
      cy.go("back");

      cy.log("unpublish the table and verify it's unpublished");
      cy.findByRole("button", { name: /Unpublish/ }).click();
      H.modal().findByText("Unpublish this table").click();
      cy.wait("@unpublishTables");
      TablePicker.getTable("Orders")
        .findByTestId("table-published")
        .should("not.exist");
      H.DataStudio.nav().findByLabelText("Semantic layer").click();
      H.DataStudio.Library.emptyStateRow(
        "Cleaned, pre-transformed data sources ready for exploring",
      ).should("be.visible");
      H.DataStudio.Library.allTableItems().should("have.length", 0);
    },
  );

  it("should allow to edit attributes", { tags: ["@external"] }, () => {
    H.restore("postgres-12");
    H.activateToken("pro-self-hosted");
    H.DataModel.visitDataStudio();
    TablePicker.getDatabase("QA Postgres12").click();
    TablePicker.getTable("Orders").click();

    cy.log("rename the table and verify the name is updated in the picker");
    H.DataModel.TableSection.getNameInput()
      .clear()
      .type("Renamed Orders")
      .blur();
    cy.wait("@updateTable");
    TablePicker.getTable("Renamed Orders").should("be.visible");
    H.undoToast().findByRole("img", { name: /Close/i }).click();

    H.selectHasValue("Owner", "No owner").click();
    H.selectDropdown().contains("Bobby Tables").click();

    H.undoToastListContainer()
      .findByText("Table owner updated")
      .should("be.visible");
    H.undoToast().findByRole("img", { name: /Close/i }).click();

    H.selectHasValue("Visibility layer", "Internal").click();
    H.selectDropdown().contains("Final").click();
    H.undoToastListContainer()
      .findByText("Table visibility layer updated")
      .should("be.visible");

    cy.log(
      "undo the change and verify the table updates to the reverted value",
    );
    H.undoToastListContainer()
      .findByText("Table visibility layer updated")
      .closest("[data-testid='toast-undo']")
      .button("Undo")
      .click();
    cy.wait("@updateTable");
    H.undoToastListContainer().findByText("Change undone").should("be.visible");
    H.undoToast().findByRole("img", { name: /Close/i }).click();
    H.selectHasValue("Visibility layer", "Internal");
    TablePicker.getTable("Orders")
      .findByTestId("table-data-layer")
      .should("have.text", "Internal");

    H.selectHasValue("Entity type", "Transaction").click();
    H.selectDropdown().contains("Person").click();
    H.undoToastListContainer()
      .findByText("Entity type updated")
      .should("be.visible");

    H.selectHasValue("Source", "Unspecified").click();
    H.selectDropdown().contains("Ingested").click();
    H.undoToastListContainer()
      .findByText("Table data source updated")
      .should("be.visible");

    // navigate away and back
    TablePicker.getTable("Products").click();
    TablePicker.getTable("Renamed Orders").click();

    H.selectHasValue("Owner", "Bobby Tables");
    H.selectHasValue("Visibility layer", "Internal");
    H.selectHasValue("Entity type", "Person");
    H.selectHasValue("Source", "Ingested");
  });

  it(
    "transform-created table should have link and disabled source edit",
    { tags: ["@external"] },
    () => {
      H.restore("postgres-writable");
      H.activateToken("pro-self-hosted");
      H.updateSetting("transforms-enabled", true);
      H.resetTestTable({ type: "postgres", table: "many_schemas" });

      const SOURCE_TABLE = "Animals";
      const TARGET_TABLE = "transform_table";
      const TARGET_SCHEMA = "Schema A";
      const TRANSFORM_TABLE_DISPLAY_NAME = "Transform Table";
      const TRANSFORM_NAME = "Test transform for animals";

      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

      // Create and run a transform to create a table
      H.createAndRunMbqlTransform({
        sourceTable: SOURCE_TABLE,
        targetTable: TARGET_TABLE,
        targetSchema: TARGET_SCHEMA,
        name: TRANSFORM_NAME,
      }).then(() => {
        H.DataModel.visitDataStudio();
        TablePicker.getDatabase("Writable Postgres12").click();
        TablePicker.getSchema(TARGET_SCHEMA).click();
        TablePicker.getTable(TRANSFORM_TABLE_DISPLAY_NAME).click();

        cy.findByRole("link", { name: new RegExp(TRANSFORM_NAME) }).should(
          "be.visible",
        );

        H.selectIsDisabled("Source");
      });
    },
  );

  describe("with remote sync enabled", () => {
    it(
      "should update the tree after publishing, unpublishing, and renaming a table (metabase#69554)",
      { tags: ["@external"] },
      () => {
        H.restore("mysql-8");
        H.activateToken("pro-self-hosted");
        H.setupGitSync();
        H.configureGit("read-write");

        H.DataModel.visitDataStudio();
        TablePicker.getDatabase("QA MySQL8").click();
        TablePicker.getTable("Orders").click();

        cy.log("publish the table and verify the tree updates");
        cy.findByRole("button", { name: /Publish/ }).click();
        H.modal().findByText("Create my semantic layer").click();
        H.modal().findByText("Publish this table").click();
        cy.wait("@publishTables");
        TablePicker.getTable("Orders")
          .findByTestId("table-published")
          .should("be.visible");

        cy.log("unpublish the table and verify the tree updates");
        cy.findByRole("button", { name: /Unpublish/ }).click();
        H.modal().findByText("Unpublish this table").click();
        cy.wait("@unpublishTables");
        TablePicker.getTable("Orders")
          .findByTestId("table-published")
          .should("not.exist");

        cy.log("rename the table and verify the tree updates");
        H.DataModel.TableSection.getNameInput()
          .clear()
          .type("Renamed Orders")
          .blur();
        cy.wait("@updateTable");
        TablePicker.getTable("Renamed Orders").should("be.visible");

        cy.log("update the owner and verify it is reflected");
        TablePicker.getTable("Renamed Orders").should(
          "not.contain.text",
          "Bobby Tables",
        );
        H.selectHasValue("Owner", "No owner").click();
        H.selectDropdown().contains("Bobby Tables").click();
        cy.wait("@updateTable");
        H.undoToastListContainer()
          .findByText("Table owner updated")
          .should("be.visible");
        H.selectHasValue("Owner", "Bobby Tables");
        TablePicker.getTable("Renamed Orders").should(
          "contain.text",
          "Bobby Tables",
        );
      },
    );
  });
});

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

function getTreeTableId(tableName: string): Cypress.Chainable<TableId> {
  return TablePicker.getTable(tableName)
    .invoke("attr", "data-table-id")
    .then((tableId: unknown) => Number(tableId));
}

interface TablesActionRequest {
  database_ids: number[];
  schema_ids: number[];
  table_ids: number[];
}

interface TablesActionsResponse {
  status: string;
  message: string;
}

interface MetadataResponse {
  data_layer: string;
  view_count: number;
}
