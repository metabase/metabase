import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { TablePicker, TableSection, FieldSection, PreviewSection, Shared } =
  cy.H.DataModel;

const {
  verifyTablePreview,
  verifyObjectDetailPreview,
  visitArea,
  getTriggeredFromArea,
} = Shared;

const { ORDERS_ID, ORDERS, FEEDBACK_ID, FEEDBACK, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

const MYSQL_DB_ID = SAMPLE_DB_ID + 1;
const MYSQL_DB_SCHEMA_ID = `${MYSQL_DB_ID}:`;

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

      describe("Name and description", () => {
        it("should allow changing the field description", () => {
          visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.TOTAL,
          });

          FieldSection.getDescriptionInput()
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
            values: ["39.72", "117.03", "49.21", "115.23", "134.91"],
          });

          cy.visit(
            `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
          );
          // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Total").should("be.visible");
          // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
          cy.findByText("New description").should("be.visible");
        });

        it("should remap FK display value from field section", () => {
          visit({
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
          verifyAndCloseToast("Name of Product ID updated");

          cy.log("verify preview");
          FieldSection.getPreviewButton().click();
          verifyTablePreview({
            column: "Remapped Product ID",
            values: ["14", "123", "105", "94", "132"],
          });
          verifyObjectDetailPreview({
            rowNumber: 2,
            row: ["Remapped Product ID", "14"],
          });

          cy.log("verify viz");
          H.openOrdersTable({ limit: 5 });
          H.tableHeaderColumn("Remapped Product ID").should("be.visible");
          H.tableHeaderColumn("Product ID", { scrollIntoView: false }).should(
            "not.exist",
          );
        });
      });

      describe("Field values", () => {
        it("should allow to sync table schema, re-scan table, and discard cached field values", () => {
          visit({
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

          // synthetic escape: realPress depends on real browser focus, which
          // the app may not hold in CI, so the keystroke can miss the modal
          cy.get("body").type("{esc}");
          H.modal().should("not.exist");
        });
      });

      describe("Data", () => {
        describe("Coercion strategy", () => {
          it("should allow you to cast a field to a data type", () => {
            visit({
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: FEEDBACK_ID,
              fieldId: FEEDBACK.RATING,
            });

            cy.log(
              "Ensure that Coercion strategy has been humanized (metabase#44723)",
            );
            FieldSection.getCoercionToggle().parent().scrollIntoView().click();
            H.popover().should("not.contain.text", "Coercion");
            H.popover().findByText("UNIX seconds → Datetime").click();
            cy.wait("@updateField");
            H.expectUnstructuredSnowplowEvent({
              event: "metadata_edited",
              event_detail: "type_casting",
              triggered_from: getTriggeredFrom(),
            });
            verifyAndCloseToast("Casting enabled for Rating");

            cy.log("verify preview");
            FieldSection.getPreviewButton().click();
            verifyTablePreview({
              column: "Rating",
              values: [
                "December 31, 1969, 4:00 PM",
                "December 31, 1969, 4:00 PM",
                "December 31, 1969, 4:00 PM",
                "December 31, 1969, 4:00 PM",
                "December 31, 1969, 4:00 PM",
              ],
            });
            verifyObjectDetailPreview({
              rowNumber: 4,
              row: ["Rating", "December 31, 1969, 4:00 PM"],
            });

            cy.log("verify viz");
            H.openTable({ database: SAMPLE_DB_ID, table: FEEDBACK_ID });
            cy.findAllByTestId("cell-data")
              .contains("December 31, 1969, 4:00 PM")
              .should("have.length.greaterThan", 0);
          });
        });
      });

      describe("Metadata", () => {
        describe("Semantic type", () => {
          it("should allow to change the type to 'Foreign Key' and choose the target field (metabase#59052)", () => {
            visit({
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.QUANTITY,
            });

            cy.log("verify preview before the change");
            FieldSection.getPreviewButton().click();
            cy.wait("@dataset");
            PreviewSection.get()
              .findAllByTestId("cell-data")
              .should("have.length", 6)
              .eq(1)
              // values of fields that are not FKs have no background
              .should("have.css", "background-color", "rgba(0, 0, 0, 0)");

            FieldSection.getSemanticTypeInput()
              .should("have.value", "Quantity")
              .click();
            H.popover().findByText("Foreign Key").click();
            cy.wait("@updateField");
            verifyAndCloseToast("Semantic type of Quantity updated");

            cy.log("verify preview");
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
              .scrollIntoView() //This should not be necessary, but CI consistently fails to scroll into view on mount
              .should("be.visible")
              .and("have.value", "Products → ID");
          });

          it("should allow to change the foreign key target", () => {
            visit({
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
            H.expectUnstructuredSnowplowEvent({
              event: "metadata_edited",
              event_detail: "semantic_type_change",
              triggered_from: getTriggeredFrom(),
            });
            H.undoToast().should(
              "contain.text",
              "Semantic type of User ID updated",
            );
            FieldSection.getSemanticTypeFkTarget().should(
              "have.value",
              "Products → ID",
            );

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

          it("should allow to change the type to 'Currency' and choose the currency (metabase#59052)", () => {
            visit({
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.TAX,
            });

            FieldSection.getSemanticTypeInput()
              .should("have.value", "No semantic type")
              .click();
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
              // it should allow to just type to search (metabase#59052)
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
            // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
            cy.findByText("Tax (CA$)").should("be.visible");
          });

          it("should not overflow the screen on smaller viewports (metabase#56442)", () => {
            const viewportHeight = 400;

            cy.viewport(1280, viewportHeight);
            visit({ databaseId: SAMPLE_DB_ID });
            TablePicker.getTable("Reviews").scrollIntoView().click();
            if (area === "data studio") {
              TableSection.clickFieldsTab();
            }
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
          it("should let you change field visibility to 'Do not include'", () => {
            visit({
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
            H.expectUnstructuredSnowplowEvent({
              event: "metadata_edited",
              event_detail: "visibility_change",
              triggered_from: getTriggeredFrom(),
            });
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
              .should("exist");
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

          it(
            "should be able to select and update a field in a database without schemas",
            { tags: ["@external"] },
            () => {
              H.restore("mysql-8");
              visit({
                databaseId: MYSQL_DB_ID,
                schemaId: MYSQL_DB_SCHEMA_ID,
                tableId: ORDERS_ID,
              });

              if (area === "data studio") {
                TableSection.clickFieldsTab();
              }
              TableSection.clickField("Tax");
              FieldSection.getVisibilityInput().click();
              H.popover().findByText("Do not include").click();
              cy.wait("@updateField");
              verifyAndCloseToast("Visibility of Tax updated");
              FieldSection.getVisibilityInput().should(
                "have.value",
                "Do not include",
              );
            },
          );
        });

        describe("Filtering", () => {
          it("should let you change filtering to 'Search box'", () => {
            visit({
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.QUANTITY,
            });

            FieldSection.getFilteringInput()
              .should("have.value", "A list of all values")
              .click();
            H.popover().findByText("Search box").click();
            cy.wait("@updateField");
            H.expectUnstructuredSnowplowEvent({
              event: "metadata_edited",
              event_detail: "filtering_change",
              triggered_from: getTriggeredFrom(),
            });
            verifyAndCloseToast("Filtering of Quantity updated");

            cy.log("verify preview");
            TableSection.clickField("Quantity");
            FieldSection.getPreviewButton().click();
            PreviewSection.getPreviewTypeInput()
              .findByText("Filtering")
              .click();
            PreviewSection.get().within(() => {
              cy.findByPlaceholderText("Enter a number").should("be.visible");
              cy.button(/Add filter/).should("not.exist");
            });

            cy.reload();
            FieldSection.getFilteringInput()
              .scrollIntoView()
              .should("be.visible")
              .and("have.value", "Search box");
          });
        });
      });
    });
  });
});

function verifyAndCloseToast(message: string) {
  H.undoToast().should("contain.text", message);
  H.undoToast().icon("close").click({ force: true });
}
