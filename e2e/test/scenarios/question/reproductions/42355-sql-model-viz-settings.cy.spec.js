import { H } from "e2e/support";

describe("issue 42355", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow overriding database fields for models with manually ordered columns (metabase#42355)", () => {
    H.createNativeQuestion({
      type: "model",
      native: { query: "SELECT ID, PRODUCT_ID FROM ORDERS" },
      visualization_settings: {
        "table.columns": [
          {
            name: "PRODUCT_ID",
            key: '["name","PRODUCT_ID"]',
            enabled: true,
            fieldRef: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
          },
          {
            name: "ID",
            key: '["name","ID"]',
            enabled: true,
            fieldRef: ["field", "ID", { "base-type": "type/BigInteger" }],
          },
        ],
        "table.cell_column": "ID",
      },
    }).then(({ body: card }) => H.visitModel(card.id));

    cy.log("update metadata");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.rightSidebar()
      .findByText("Database column this maps to")
      .next()
      .findByText("None")
      .click();
    H.popover().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("ID").click();
    });
    cy.button("Save changes").click();

    cy.log("check metadata changes are visible");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.rightSidebar()
      .findByText("Database column this maps to")
      .next()
      .findByText("Orders → ID")
      .should("be.visible");
  });
});
