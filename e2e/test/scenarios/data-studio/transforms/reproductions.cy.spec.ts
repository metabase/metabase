import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { createMockSearchResult } from "metabase-types/api/mocks";

const { H } = cy;

const SOURCE_TABLE = "Animals";
const TARGET_TABLE = "transform_table";
const TARGET_SCHEMA = "Schema A";

describe("issue #68378", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "empty_schema" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("should show empty schemas when picking a target schema (metabase#68378)", () => {
    visitTransformListPage();
    cy.button("Create a transform").click();
    H.popover().findByText("SQL query").click();
    H.popover().findByText("Writable Postgres12").click();
    H.NativeEditor.type("SELECT 42", { allowFastSet: true }).blur();

    cy.log("Save with empty_schema as target schema");
    getQueryEditor().button("Save").click();

    H.modal().within(() => {
      cy.findByLabelText("Name").clear().type("SQL transform");
      cy.findByLabelText("Schema").click();
    });
    H.popover().findByText("empty_schema").should("be.visible").click();

    H.modal().button("Save").click();
  });
});

describe("issue GDGT-1776", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "empty_schema" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    const ITEMS_COUNT = 1000;

    cy.intercept("GET", "/api/collection/root/items*", {
      statusCode: 200,
      body: {
        data: Array.from({ length: ITEMS_COUNT }).map((_value, index) => {
          return createMockSearchResult({
            id: index + 1,
            model: "table",
          });
        }),
        limit: null,
        models: [
          "card",
          "collection",
          "dashboard",
          "dataset",
          "document",
          "metric",
          "pulse",
          "table",
          "timeline",
        ],
        offset: null,
        total: ITEMS_COUNT,
      },
    });
  });

  it("should not crash the app when processing lots of hidden items in the MiniPicker (GDGT-1776)", () => {
    visitTransformListPage();
    cy.button("Create a transform").click();
    H.popover().findByText("Query builder").click();
    H.popover().findByText("Our analytics").click();

    cy.findByTestId("loading-indicator").should("not.exist");
    H.main().findByText("Something’s gone wrong").should("not.exist");
    cy.button("Cancel").should("be.visible");
  });
});

describe("issue GDGT-1774", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });
  });

  it("should display field options in the incremental update field picker (GDGT-1774)", () => {
    H.getTableId({ name: SOURCE_TABLE })
      .then((tableId) =>
        H.createTransform({
          name: "Incremental MBQL transform",
          source: {
            type: "query",
            query: {
              database: WRITABLE_DB_ID,
              type: "query",
              query: { "source-table": tableId },
            },
            "source-incremental-strategy": { type: "checkpoint" },
          },
          target: {
            type: "table-incremental",
            database: WRITABLE_DB_ID,
            name: TARGET_TABLE,
            schema: TARGET_SCHEMA,
            "target-incremental-strategy": { type: "append" },
          },
        }),
      )
      .then((res) => H.DataStudio.Transforms.visitSettingsTab(res.body.id));

    cy.log("Field picker should be visible and have selectable options");
    cy.findByLabelText("Field to check for new values")
      .scrollIntoView()
      .should("be.visible")
      .click();

    H.popover().findAllByRole("option").should("have.length.greaterThan", 0);
  });
});

function visitTransformListPage() {
  return cy.visit("/data-studio/transforms");
}

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}
