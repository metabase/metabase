import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { TablePicker, TableSection, FieldSection, PreviewSection, Shared } =
  cy.H.DataModel;

const {
  visitArea,
  getBasePathForArea,
  verifyAndCloseToast,
  verifyObjectDetailPreview,
  getInterceptsForArea,
} = Shared;

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const areas: ("admin" | "data studio")[] = ["admin", "data studio"];

areas.forEach((area) => {
  describe(`data model > ${area}`, () => {
    const getBasePath = getBasePathForArea(area);
    const visit = visitArea(area);

    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");

      getInterceptsForArea(area);
    });

    describe("Table picker", () => {
      describe(
        "mutliple databases, with single and multiple schemas",
        { tags: "@external" },
        () => {
          beforeEach(() => {
            H.restore("postgres-writable");
            H.activateToken("pro-self-hosted");

            H.resetTestTable({ type: "postgres", table: "multi_schema" });
            H.resyncDatabase({ dbId: WRITABLE_DB_ID });
          });

          it("should allow to navigate databases, schemas, and tables", () => {
            visit();

            TablePicker.getDatabase("Writable Postgres12").click();
            TablePicker.getSchemas().should("have.length", 2);

            TablePicker.getSchema("Domestic").click();
            TablePicker.getTables().should("have.length", 1);

            TablePicker.getTable("Animals").click();
            TableSection.getNameInput().should("have.value", "Animals");
            cy.location("pathname").should(
              "match",
              new RegExp(
                `^${getBasePath()}/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/\\d+`,
              ),
            );

            TablePicker.getSchema("Wild").click();
            TablePicker.getTables().should("have.length", 3);

            TablePicker.getTable("Birds").click();
            TableSection.getNameInput().should("have.value", "Birds");
            cy.location("pathname").should(
              "match",
              new RegExp(
                `^${getBasePath()}/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Wild/table/\\d+`,
              ),
            );
          });
        },
      );
    });

    describe("Table section", () => {
      it("should be able to preview the table in the query builder", () => {
        visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });
        TableSection.getQueryBuilderLink().click();
        H.queryBuilderHeader().findByText("Orders").should("be.visible");
      });

      describe("Name and description", () => {
        it("should allow changing the table name", () => {
          visit({
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
      });

      describe("Field name and description", () => {
        it("should allow changing the field name", () => {
          visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
          });

          if (area === "data studio") {
            TableSection.clickFieldsTab();
          }
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
          visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
          });

          if (area === "data studio") {
            TableSection.clickFieldsTab();
          }
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

        it("should allow clearing the field description", () => {
          visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
          });

          if (area === "data studio") {
            TableSection.clickFieldsTab();
          }
          TableSection.getFieldDescriptionInput("Total").clear().blur();
          cy.wait("@updateField");
          verifyAndCloseToast("Description of Total updated");
          TableSection.getFieldDescriptionInput("Total").should(
            "have.value",
            "",
          );

          cy.log("verify preview");
          TableSection.clickField("Total");
          FieldSection.getPreviewButton().click();
          verifyTablePreview({
            column: "Total",
            values: ["39.72", "117.03", "49.21", "115.23", "134.91"],
          });
          // realHover is avoided here because Chrome v133+ headless hit-tests
          // CDP mouse events differently and the HoverCard wouldn't open. We
          // dispatch synthetic events instead — both `mouseover` (bubbles, so
          // React 18 turns it into onMouseEnter for any wrapper) and
          // `mouseenter` (for any native useEventListener-attached handler on
          // the cell itself). After `cy.wait("@dataset")` the table re-renders
          // on a microtask (fetch resolution), so re-query the cell each time
          // to ensure the events land on the post-render DOM node.
          hoverHeaderCell();
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
    });
  });
});

// Open the preview's column-description hovercard. After `cy.wait("@dataset")`
// the table re-renders on a microtask (fetch resolution), so a single
// `.trigger("mouseover")` chained off an earlier find can land on a stale DOM
// node. Re-query for each dispatch, and fire both `mouseover` (bubbles → React
// 18 synthetic onMouseEnter for any wrapper) and `mouseenter` (for native
// useEventListener handlers Mantine attaches directly).
function hoverHeaderCell() {
  const headerCell = () =>
    cy
      .findByTestId("header-cell")
      .findByTestId("cell-data")
      .should("be.visible");
  headerCell().trigger("mouseenter", { force: true });
  headerCell().trigger("mouseover", { force: true });
}

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
      hoverHeaderCell();
    }
  });

  if (description != null) {
    H.hovercard().should("contain.text", description);
  }
}
