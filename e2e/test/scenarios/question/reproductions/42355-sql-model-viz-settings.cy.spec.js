import {
  createNativeQuestion,
  openQuestionActions,
  popover,
  restore,
  rightSidebar,
  visitModel,
} from "e2e/support/helpers";

describe("issue 42355", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should allow overriding database fields for models with manually ordered columns (metabase#42355)", () => {
    createNativeQuestion({
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
    }).then(({ body: card }) => visitModel(card.id));

    cy.log("update metadata");
    openQuestionActions();
    popover().findByText("Edit metadata").click();
    rightSidebar()
      .findByText("Database column this maps to")
      .next()
      .findByText("None")
      .click();
    popover().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("ID").click();
    });
    cy.button("Save changes").click();

    cy.log("check metadata changes are visible");
    openQuestionActions();
    popover().findByText("Edit metadata").click();
    rightSidebar()
      .findByText("Database column this maps to")
      .next()
      .findByText("Orders → ID")
      .should("be.visible");
  });
});
