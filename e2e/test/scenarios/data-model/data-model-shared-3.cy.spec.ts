import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;
const { TablePicker, TableSection, FieldSection, PreviewSection, Shared } =
  cy.H.DataModel;

const {
  verifyTablePreview,
  verifyObjectDetailPreview,
  visitArea,
  getTriggeredFromArea,
} = Shared;

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const areas: ("admin" | "data studio")[] = ["admin", "data studio"];

areas.forEach((area) => {
  describe(`data model > ${area}`, () => {
    const visit = visitArea(area);
    const getTriggeredFrom = getTriggeredFromArea(area);

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

      cy.intercept({ method: "GET", pathname: "/api/database" }).as(
        "databases",
      );

      if (area === "admin") {
        cy.intercept("GET", "/api/field/*/values").as("fieldValues");
        cy.intercept("PUT", "/api/table/*").as("updateTable");
      }
    });

    describe("Field section", () => {
      beforeEach(() => {
        H.resetSnowplow();
        H.enableTracking();
      });

      afterEach(() => {
        H.expectNoBadSnowplowEvents();
      });

      describe("Behavior", () => {
        describe("Display values", () => {
          it("should let you change to 'Use foreign key', change the target and see the remapped values", () => {
            visit({
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.PRODUCT_ID,
            });

            cy.log("verify preview");
            FieldSection.getPreviewButton().click();
            verifyTablePreview({
              column: "Product ID",
              values: ["14", "123", "105", "94", "132"],
            });
            verifyObjectDetailPreview({
              rowNumber: 2,
              row: ["Product ID", "14"],
            });

            FieldSection.getDisplayValuesInput().click();
            H.popover().findByText("Use foreign key").click();
            H.popover().findByText("Title").click();
            cy.wait("@updateFieldDimension");
            H.expectUnstructuredSnowplowEvent({
              event: "metadata_edited",
              event_detail: "display_values",
              triggered_from: getTriggeredFrom(),
            });
            H.undoToast().should(
              "contain.text",
              "Display values of Product ID updated",
            );

            cy.log("verify preview");
            verifyObjectDetailPreview({
              rowNumber: 2,
              row: ["Product ID", "Awesome Concrete Shoes"],
            });
            verifyTablePreview({
              column: "Product ID",
              values: [
                "Awesome Concrete Shoes",
                "Mediocre Wooden Bench",
                "Fantastic Wool Shirt",
                "Awesome Bronze Plate",
                "Sleek Steel Table",
              ],
            });

            FieldSection.get()
              .findByText(
                "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
              )
              .scrollIntoView()
              .should("be.visible");

            cy.reload();
            FieldSection.getDisplayValuesInput()
              .scrollIntoView()
              .should("be.visible")
              .and("have.value", "Use foreign key");
            FieldSection.getDisplayValuesFkTargetInput()
              .should("be.visible")
              .and("have.value", "Title");

            cy.log("Name of the product should be displayed instead of its ID");
            H.openOrdersTable();
            cy.findByRole("gridcell", {
              name: "Awesome Concrete Shoes",
            }).should("be.visible");
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

            visit({ databaseId: SAMPLE_DB_ID });
            // edit "Rating" values in "Reviews" table
            TablePicker.getTable("Reviews").click();
            if (area === "data studio") {
              TableSection.clickFieldsTab();
            }
            TableSection.clickField("Rating");

            // apply custom remapping for "Rating" values 1-5
            FieldSection.getDisplayValuesInput().click();
            H.popover().findByText("Custom mapping").click();
            cy.wait("@updateFieldValues");
            H.undoToast().should(
              "contain.text",
              "Display values of Rating updated",
            );
            H.undoToast().icon("close").click({
              force: true, // it's behind a modal
            });
            H.modal().within(() => {
              cy.findByText(
                "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
              ).should("be.visible");

              Object.entries(customMap).forEach(([key, value]) => {
                cy.findByDisplayValue(key).click().clear().type(value);
              });

              cy.button("Save").click();
            });
            cy.wait("@updateFieldValues");
            cy.wait("@updateFieldDimension");
            H.undoToast().should(
              "contain.text",
              "Display values of Rating updated",
            );

            cy.log("verify preview");
            FieldSection.getPreviewButton().click();
            verifyTablePreview({
              column: "Rating",
              values: [
                "Perfecto",
                "Enjoyable",
                "Perfecto",
                "Enjoyable",
                "Perfecto",
              ],
            });
            verifyObjectDetailPreview({
              rowNumber: 3,
              row: ["Rating", "Perfecto"],
            });

            cy.log("Numeric ratings should be remapped to custom strings");
            H.openReviewsTable();
            Object.values(customMap).forEach((rating) => {
              cy.findAllByText(rating)
                .eq(0)
                .scrollIntoView()
                .should("be.visible");
            });
          });

          it("should allow to map FK to date fields (metabase#7108)", () => {
            visit({
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.USER_ID,
            });

            FieldSection.getDisplayValuesInput().click();
            H.popover().findByText("Use foreign key").click();
            cy.wait("@updateFieldDimension");
            verifyAndCloseToast("Display values of User ID updated");

            FieldSection.getDisplayValuesFkTargetInput().click();

            H.popover().within(() => {
              cy.findByText("Birth Date").scrollIntoView().should("be.visible");
              cy.findByText("Created At")
                .scrollIntoView()
                .should("be.visible")
                .click();
            });
            cy.wait("@updateFieldDimension");
            H.undoToast().should(
              "contain.text",
              "Display values of User ID updated",
            );

            cy.log("verify preview");
            FieldSection.getPreviewButton().click();
            verifyTablePreview({
              column: "User ID",
              values: [
                "2026-10-07T01:34:35.462-07:00",
                "2026-10-07T01:34:35.462-07:00",
                "2026-10-07T01:34:35.462-07:00",
                "2026-10-07T01:34:35.462-07:00",
                "2026-10-07T01:34:35.462-07:00",
              ],
            });
            verifyObjectDetailPreview({
              rowNumber: 1,
              row: ["User ID", "2026-10-07T01:34:35.462-07:00"],
            });

            H.visitQuestion(ORDERS_QUESTION_ID);
            cy.findAllByTestId("cell-data")
              .eq(10) // 1st data row, 2nd column (User ID)
              .should("have.text", "2026-10-07T01:34:35.462-07:00");
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
            visit({ databaseId: WRITABLE_DB_ID });
            TablePicker.getTable("Many Data Types").click();
            if (area === "data studio") {
              TableSection.clickFieldsTab();
            }

            cy.log("json is unfolded initially and shows prefix");
            TableSection.getField("Json → A")
              .scrollIntoView()
              .should("be.visible");
            TableSection.getField("Json → A")
              .findByTestId("name-prefix")
              .scrollIntoView()
              .should("be.visible")
              .and("have.text", "Json:");

            cy.log("shows prefix in field section");
            TableSection.clickField("Json → A");
            FieldSection.get()
              .findByTestId("name-prefix")
              .scrollIntoView()
              .should("be.visible")
              .and("have.text", "Json:");
            FieldSection.getRawName()
              .scrollIntoView()
              .should("be.visible")
              .and("have.text", "json.a");

            cy.log("verify preview");
            FieldSection.getPreviewButton().click();
            verifyTablePreview({
              column: "Json → A",
              values: ["10", "10"],
            });
            verifyObjectDetailPreview({
              rowNumber: 1,
              row: ["Json → A", "10"],
            });

            cy.log("show prefix in table section when sorting");
            TableSection.getSortButton().click();
            TableSection.getField("Json → A")
              .findByTestId("name-prefix")
              .should("be.visible")
              .and("have.text", "Json:");
            TableSection.get().button("Done").click();
            TableSection.clickField("Json");

            FieldSection.getUnfoldJsonInput()
              .should("have.value", "Yes")
              .click();
            H.popover().findByText("No").click();
            cy.wait("@updateField");
            H.expectUnstructuredSnowplowEvent({
              event: "metadata_edited",
              event_detail: "json_unfolding",
              triggered_from: getTriggeredFrom(),
            });
            H.undoToast().should(
              "contain.text",
              "JSON unfolding disabled for Json",
            );

            // Check setting has persisted
            cy.reload();
            FieldSection.getUnfoldJsonInput().should("have.value", "No");

            // Sync database
            cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
            cy.button("Sync database schema").click();
            cy.wait("@sync_schema");
            cy.button(/Sync triggered!/).should("be.visible");

            // Check json field is not unfolded
            visit({ databaseId: WRITABLE_DB_ID });
            TablePicker.getTable("Many Data Types").click();
            if (area === "data studio") {
              TableSection.clickFieldsTab();
            }
            TableSection.getField("Json → A").should("not.exist");
          });

          it("should let you change the name of JSON-unfolded columns (metabase#55563)", () => {
            visit({ databaseId: WRITABLE_DB_ID });
            TablePicker.getTable("Many Data Types").click();
            if (area === "data studio") {
              TableSection.clickFieldsTab();
            }
            TableSection.clickField("Json → A");

            TableSection.getFieldNameInput("Json → A").clear().type("A").blur();
            FieldSection.getPreviewButton().click();

            FieldSection.getNameInput().should("have.value", "A");
            FieldSection.get()
              .findByTestId("name-prefix")
              .scrollIntoView()
              .should("be.visible")
              .and("have.text", "Json:");
            verifyTablePreview({
              column: "A",
              values: ["10", "10"],
            });

            cy.log("close the preview so the prefixes get their usual width");
            FieldSection.getPreviewButton().click();
            PreviewSection.get().should("not.exist");

            cy.log("does not truncate a short prefix");
            const shortPrefix = "Short prefix";
            const longPrefix = "Legendarily long column prefix";
            TableSection.getFieldNameInput("Json")
              .clear()
              .type(shortPrefix)
              .blur();

            cy.log("in field section");
            FieldSection.get()
              .findByTestId("name-prefix")
              .should("have.text", `${shortPrefix}:`)
              .then((element) => {
                H.assertIsNotEllipsified(element[0]);
              });
            FieldSection.get().findByTestId("name-prefix").realHover();
            H.tooltip().should("not.exist");

            cy.log("in table section");
            // the test id is on a box that never clips, so measure its text
            TableSection.getField("Json → D")
              .findByTestId("name-prefix")
              .findByText(`${shortPrefix}:`)
              .then((element) => {
                H.assertIsNotEllipsified(element[0]);
              });
            TableSection.getField("Json → D")
              .findByTestId("name-prefix")
              .realHover();
            H.tooltip().should("not.exist");

            cy.log("truncates a long prefix");
            TableSection.getFieldNameInput(shortPrefix)
              .clear()
              .type(longPrefix)
              .blur();

            cy.log("in field section");
            FieldSection.get()
              .findByTestId("name-prefix")
              .should("have.text", `${longPrefix}:`)
              .then((element) => {
                H.assertIsEllipsified(element[0]);
              });
            FieldSection.get()
              .findByTestId("name-prefix")
              .realHover({ scrollBehavior: "center" });
            H.tooltip().should("be.visible").and("have.text", longPrefix);

            // hide tooltip, by hovering something it can't be covering (it can
            // flip below the prefix, over the description input)
            FieldSection.get().findByText("Field settings").realHover();
            H.tooltip().should("not.exist");

            cy.log("in table section");
            TableSection.getField("Json → D")
              .scrollIntoView({ offset: { left: 0, top: -400 } })
              .findByTestId("name-prefix")
              .findByText(`${longPrefix}:`)
              .then((element) => {
                H.assertIsEllipsified(element[0]);
              });
            TableSection.getField("Json → D")
              .findByTestId("name-prefix")
              .realHover({ scrollBehavior: "center" });
            H.tooltip().should("be.visible").and("have.text", longPrefix);
          });
        });
      });

      describe("Formatting", () => {
        it("should save and obey field prefix formatting settings", () => {
          visit({
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
      });
    });

    describe("Undos", () => {
      it("should undo a field order change and a field change", () => {
        visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.QUANTITY,
        });

        cy.log("custom field order");
        TableSection.getSortButton().click();
        TableSection.getSortableField("ID").as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", {
          vertical: 50,
        });
        cy.wait("@updateFieldOrder");
        verifyToastAndUndo("Field order updated");
        cy.wait("@updateTable")
          .its("request.body.field_order")
          .should("eq", "database");
        TableSection.getSortOrderInput()
          .findByDisplayValue("database")
          .should("be.checked");
        TableSection.get().button("Done").click();

        cy.log("semantic type");
        FieldSection.getSemanticTypeInput().click();
        H.popover().findByText("Score").click();
        cy.wait("@updateField");
        verifyToastAndUndo("Semantic type of Quantity updated");
        cy.wait("@updateField")
          .its("request.body.semantic_type")
          .should("eq", "type/Quantity");
        FieldSection.getSemanticTypeInput().should("have.value", "Quantity");

        cy.log("the undone values are stored");
        cy.reload();
        FieldSection.getSemanticTypeInput().should("have.value", "Quantity");
        TableSection.getSortButton().click();
        TableSection.getSortOrderInput()
          .findByDisplayValue("database")
          .should("be.checked");
        TableSection.getSortableFields().first().should("contain.text", "ID");
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
