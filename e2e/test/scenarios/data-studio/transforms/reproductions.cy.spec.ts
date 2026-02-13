import { createMockSearchResult } from "metabase-types/api/mocks";

const { H } = cy;

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

function visitTransformListPage() {
  return cy.visit("/data-studio/transforms");
}

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}
