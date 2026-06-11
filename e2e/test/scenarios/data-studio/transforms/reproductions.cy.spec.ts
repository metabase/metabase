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

describe("issue 69904", () => {
  const TRANSFORM_TARGET_TABLE = "deleted_transform_table";

  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);
  });

  it("should not crash the app when opening table created by a deleted transform (metabase#69904)", () => {
    H.createAndRunSqlTransform({
      name: "Transform to delete",
      sourceQuery: "SELECT 1 AS answer",
      targetTable: TRANSFORM_TARGET_TABLE,
      targetSchema: "public",
    }).then(({ transformId }) => {
      cy.request("DELETE", `/api/transform/${transformId}`);

      H.getTableId({
        databaseId: WRITABLE_DB_ID,
        name: TRANSFORM_TARGET_TABLE,
      }).then((tableId) => {
        H.DataModel.visitDataStudio({
          databaseId: WRITABLE_DB_ID,
          schemaId: `${WRITABLE_DB_ID}:public`,
          tableId,
        });
      });

      H.DataModel.TableSection.get()
        .findByText("Transform does not exist anymore")
        .should("be.visible");
    });
  });
});

describe("issue GDGT-2429", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);
  });

  function startNewSqlTransform() {
    visitTransformListPage();
    cy.button("Create a transform").click();
    H.popover().findByText("SQL query").click();
    H.popover().findByText("Writable Postgres12").click();
    H.NativeEditor.type("SELECT 42", { allowFastSet: true }).blur();
  }

  function openSaveModal() {
    getQueryEditor().button("Save").click();
    H.modal().findByText("Save your transform").should("be.visible");
  }

  it("should warn about unsaved changes when navigating away while the save modal is open (metabase#GDGT-2429)", () => {
    cy.intercept("POST", "/api/transform").as("createTransform");

    startNewSqlTransform();
    openSaveModal();

    cy.log("navigating away while the save modal is open should warn");
    cy.go("back");
    H.leaveConfirmationModal().should("be.visible");

    cy.log("pressing Esc should close the warning, not the saving modal");
    // Wait for Mantine's focus trap to move focus inside the leave-confirm modal
    // before pressing Escape. `be.visible` passes during the open transition,
    // before the trap engages, so an early Escape lands outside the modal's
    // focus-trapped content (where its closeOnEscape handler lives) and is lost,
    // leaving the modal open.
    H.leaveConfirmationModal().within(() => {
      cy.get(":focus").should("exist");
    });
    cy.realPress("Escape");
    H.leaveConfirmationModal().should("not.exist");
    H.modal().findByText("Save your transform").should("be.visible");

    cy.log("saving the transform should allow navigating away without warning");
    H.modal().within(() => {
      cy.findByLabelText("Name").clear().type("GDGT-2429 transform");
      cy.button("Save").click();
    });
    cy.wait("@createTransform");

    cy.go("back");
    H.leaveConfirmationModal().should("not.exist");
  });
});

function visitTransformListPage() {
  return cy.visit("/data-studio/transforms");
}

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}
