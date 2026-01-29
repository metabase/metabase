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

function visitTransformListPage() {
  return cy.visit("/data-studio/transforms");
}

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}
