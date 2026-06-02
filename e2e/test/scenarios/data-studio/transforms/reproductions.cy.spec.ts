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
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);
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
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);

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
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });
  });

  it("should display field options in the incremental update field picker (GDGT-1774)", () => {
    H.getTableId({ name: SOURCE_TABLE })
      .then((tableId) =>
        H.getFieldId({ tableId, name: "score" }).then((fieldId) =>
          H.createTransform({
            name: "Incremental MBQL transform",
            source: {
              type: "query",
              query: {
                database: WRITABLE_DB_ID,
                type: "query",
                query: { "source-table": tableId },
              },
              "source-incremental-strategy": {
                type: "checkpoint",
                "checkpoint-filter-field-id": fieldId,
              },
            },
            target: {
              type: "table-incremental",
              database: WRITABLE_DB_ID,
              name: TARGET_TABLE,
              schema: TARGET_SCHEMA,
              "target-incremental-strategy": { type: "append" },
            },
          }),
        ),
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

describe("issue UXW-3160", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);
  });

  it("should let the read-only definition view scroll to the last line of a long SQL transform (UXW-3160)", () => {
    const lastLineMarker = "-- UXW_3160_LAST_LINE";
    const longSql =
      "SELECT\n  " +
      Array.from({ length: 80 }, (_, i) => `'col_${i}' AS col_${i}`).join(
        ",\n  ",
      ) +
      `\n${lastLineMarker}`;

    H.createSqlTransform({
      name: "Long SQL transform",
      sourceQuery: longSql,
      targetTable: "uxw_3160_target",
      targetSchema: "public",
      visitTransform: true,
    });

    cy.get(".cm-scroller").then(($el) => {
      const scroller = $el[0];
      scroller.scrollTop = scroller.scrollHeight;
    });

    cy.get(".cm-scroller").should(($el) => {
      const rect = $el[0].getBoundingClientRect();
      expect(rect.bottom).to.be.at.most(Cypress.config("viewportHeight"));
    });

    cy.get(".cm-scroller").findByText(lastLineMarker).should("be.visible");
  });
});

describe("issue GDGT-2365", { tags: ["@external", "@python"] }, () => {
  const DB_NAME = "Writable Postgres12";

  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);
    H.setPythonRunnerSettings();
  });

  it("should not render the editor search panel over the table picker modal (GDGT-2365)", () => {
    visitTransformListPage();
    cy.button("Create a transform").click();
    H.popover().findByText("Python script").click();

    cy.log("select a database so the table picker becomes available");
    cy.findByTestId("python-transform-top-bar").findByText(DB_NAME).click();
    H.popover().findByText(DB_NAME).click();

    cy.log("open the editor search panel with Cmd/Ctrl+F");
    H.PythonEditor.focus();
    cy.realPress([H.metaKey, "f"]);
    cy.findByTestId("python-editor").find(".cm-panels").should("be.visible");

    cy.log("open the table picker modal");
    getPythonDataPicker().findByText("Select a table…").click();
    H.entityPickerModal().should("be.visible");

    cy.log("the search panel must paint below the modal, not over it");
    H.entityPickerModal()
      .findByRole("dialog")
      .invoke("css", "z-index")
      .then((modalZIndex) => {
        cy.findByTestId("python-editor")
          .find(".cm-panels")
          .invoke("css", "z-index")
          .then((panelZIndex) => {
            expect(
              Number(panelZIndex),
              "search panel z-index stacks below the modal",
            ).to.be.lessThan(Number(modalZIndex));
          });
      });
  });
});

function visitTransformListPage() {
  return cy.visit("/data-studio/transforms");
}

function getPythonDataPicker() {
  return cy.findByTestId("python-data-picker");
}

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}
