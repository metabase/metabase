import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { TablePicker, TableSection, FieldSection, Shared } = cy.H.DataModel;

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;
const { visitArea } = Shared;

const areas: ("admin" | "data studio")[] = ["admin", "data studio"];

areas.forEach((area) => {
  describe(`data model > ${area}`, () => {
    const visit = visitArea(area);

    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");

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

      if (area === "admin") {
        cy.intercept("GET", "/api/database?*").as("databases");
        cy.intercept("GET", "/api/field/*/values").as("fieldValues");
        cy.intercept("PUT", "/api/table/*").as("updateTable");
      }

      if (area === "data studio") {
        cy.intercept("GET", "/api/database").as("databases");
      }
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
        visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.QUANTITY,
        });

        cy.log("table section");

        if (area === "data studio") {
          TableSection.clickDetailsTab();
        }
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

        if (area === "data studio") {
          TableSection.clickFieldsTab();
        }
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
        TableSection.getSortableField("ID").as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", {
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
        TableSection.clickField("Quantity");

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
        // The in-test DB switch via picker (.getDatabase().click() then
        // .getTable().click()) races the picker re-render: the table click can
        // land before the writable DB tables list is interactive, so the click
        // never propagates to a URL change. visit() waits for picker bootstrap.
        visit({ databaseId: WRITABLE_DB_ID });
        TablePicker.getTable("Many Data Types").click();
        if (area === "data studio") {
          TableSection.clickFieldsTab();
        }
        TableSection.clickField("Json");
        FieldSection.getUnfoldJsonInput().click();
        H.popover().findByText("No").click();
        verifyToastAndUndo("JSON unfolding disabled for Json");
        FieldSection.getUnfoldJsonInput().should("have.value", "Yes");

        cy.log("formatting");
        // Same fresh-visit anchor as the Many Data Types switch above.
        visit({ databaseId: SAMPLE_DB_ID });
        TablePicker.getTable("Orders").click();
        if (area === "data studio") {
          TableSection.clickFieldsTab();
        }
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
  });
});

function verifyAndCloseToast(message: string) {
  H.undoToast().should("contain.text", message);
  H.undoToast().icon("close").click({ force: true });
}

function verifyToastAndUndo(message: string) {
  // Under network throttling, clicking Undo creates a new "Change undone"
  // toast alongside the original (Mantine notifications stack rather than
  // mutate in place). The original auto-dismisses, but the dismiss can lag
  // past Cypress's 4s retry window, so cy.findByTestId("toast-undo")
  // singular sees two elements and fails with "Found multiple elements".
  // Assert against the list (waits for the expected toast), then scope the
  // action to that toast so we never act on the wrong one.
  const toast = (text: string) =>
    H.undoToastList().filter(`:contains("${text}")`).first();

  H.undoToastList().should("contain.text", message);
  toast(message).button("Undo").click();

  H.undoToastList().should("contain.text", "Change undone");
  toast("Change undone").icon("close").click({ force: true });
}
