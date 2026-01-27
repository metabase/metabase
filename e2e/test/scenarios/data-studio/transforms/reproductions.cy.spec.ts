const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

describe("issue #68378", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "empty_schema" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.request("POST", `/api/database/${WRITABLE_DB_ID}/sync_schema`);
  });

  it("should show empty schema's when picking a target schema (metabase#68378)", () => {
    visitTransformListPage();
    cy.button("Create a transform").click();
    H.popover().findByText("SQL query").click();
    H.NativeEditor.type("SELECT 42", { allowFastSet: true });

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

function visitTransformListPage() {
  return cy.visit("/data-studio/transforms");
}

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}
