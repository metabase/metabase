import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NODATA_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;
const { TablePicker, TableSection, FieldSection, PreviewSection } = H.DataModel;

const { ORDERS, ORDERS_ID, PRODUCTS_ID, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("scenarios > data studio > datamodel", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.intercept("POST", "/api/dataset*").as("dataset");
    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("PUT", "/api/table/*/fields/order").as("updateFieldOrder");
    cy.intercept("POST", "/api/field/*/values").as("updateFieldValues");
    cy.intercept("POST", "/api/field/*/dimension").as("updateFieldDimension");
    cy.intercept("PUT", "/api/table/*").as("updateTable");
  });

  describe("Table section", () => {
    describe("Name and description", () => {
      it("should allow analysts to edit table and field metadata but not preview data without data access", () => {
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
      it("should allow sorting fields alphabetically", () => {
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
      });

      it("should allow sorting fields in the custom order and switching to predefined order after drag & drop (metabase#56482)", () => {
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

        cy.log("should allow drag & drop afterwards (metabase#56482)");
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
        TableSection.getSortOrderInput()
          .findByDisplayValue("custom")
          .should("be.checked");

        cy.log("verify the custom order in the query builder");
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
      H.resetSnowplow();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should allow analysts to change the foreign key target and display values, but not custom mapping, without data access", () => {
      H.setUserAsAnalyst(NODATA_USER_ID);
      cy.signIn("nodata");

      H.DataModel.visitDataStudio({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.USER_ID,
      });

      cy.log("change the foreign key target");
      FieldSection.getSemanticTypeFkTarget()
        .should("have.value", "People → ID")
        .click();
      H.popover().within(() => {
        cy.findByText("Reviews → ID").should("be.visible");
        cy.findByText("Products → ID").click();
      });
      cy.wait("@updateField");
      verifyAndCloseToast("Semantic type of User ID updated");
      FieldSection.getSemanticTypeFkTarget().should(
        "have.value",
        "Products → ID",
      );

      cy.log("change display values to use foreign key");
      TablePicker.getTable("Reviews").click();
      TableSection.clickFieldsTab();
      TableSection.clickField("Product ID");
      FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Use foreign key").click();
      H.popover().findByText("Title").click();
      cy.wait("@updateFieldDimension");
      verifyAndCloseToast("Display values of Product ID updated");
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
      TableSection.clickField("Rating");
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
      verifyAndCloseToast("Display values of Rating updated");

      H.modal().within(() => {
        cy.findByDisplayValue("1").click().clear().type("Terrible");
        cy.findByDisplayValue("5").click().clear().type("Amazing");
        cy.button("Save").click();
      });
      cy.wait("@updateFieldValues");
      H.undoToast().should("contain.text", "Display values of Rating updated");

      cy.log("verify the FK target change in the query builder as normal user");
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

      cy.log("verify the display value changes as normal user");
      H.openReviewsTable({ limit: 1 });
      H.main().findByText("Rustic Paper Wallet").should("be.visible");

      H.openReviewsTable();
      H.main().findByText("Terrible").should("be.visible");
      H.main().findAllByText("Amazing").should("be.visible");
    });
  });

  describe("Preview section", () => {
    it("should close the preview with Esc key unless a modal, the command palette, or a popover is open", () => {
      H.DataModel.visitDataStudio({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.PRODUCT_ID,
      });

      FieldSection.get().should("be.visible");
      PreviewSection.get().should("not.exist");

      cy.log("Esc closes the preview");
      FieldSection.getPreviewButton().click();
      PreviewSection.get().scrollIntoView().should("be.visible");
      cy.realPress("Escape");
      FieldSection.get().should("be.visible");
      PreviewSection.get().should("not.exist");

      cy.log("Esc closes an open modal but not the preview");
      FieldSection.getPreviewButton().click();
      PreviewSection.get().scrollIntoView().should("be.visible");
      FieldSection.getFieldValuesButton().click();
      H.modal().should("be.visible");
      cy.realPress("Escape");
      H.modal().should("not.exist");
      PreviewSection.get().should("be.visible");

      cy.log("Esc closes the command palette but not the preview");
      H.openCommandPalette();
      H.commandPalette().should("be.visible");
      cy.realPress("Escape");
      H.commandPalette().should("not.exist");
      PreviewSection.get().should("be.visible");

      cy.log("Esc closes an open popover but not the preview");
      FieldSection.getSemanticTypeInput().click();
      H.popover().should("be.visible");
      cy.realPress("Escape");
      H.popover({ skipVisibilityCheck: true }).should("not.be.visible");
      PreviewSection.get().scrollIntoView().should("be.visible");
    });
  });

  it("should allow you to close table and field details", () => {
    H.DataModel.visitDataStudio({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });

    FieldSection.getPreviewButton().click({ scrollBehavior: "center" });

    PreviewSection.get().scrollIntoView().should("be.visible");

    FieldSection.getCloseButton().click();

    TableSection.get().should("exist");
    PreviewSection.get().should("not.exist");
    FieldSection.get().should("not.exist");

    TableSection.getCloseButton().click();
    TableSection.get().should("not.exist");

    cy.log(
      "ensure that preview opened state was cleared and does not re-appear",
    );
    TablePicker.getTable("Orders").click();
    TableSection.clickFieldsTab();
    TableSection.clickField("Subtotal");
    FieldSection.get().should("be.visible");
    TableSection.get().should("exist");
    PreviewSection.get().should("not.exist");
  });
});

function verifyAndCloseToast(message: string) {
  H.undoToast().should("contain.text", message);
  H.undoToast().icon("close").click({ force: true });
}
