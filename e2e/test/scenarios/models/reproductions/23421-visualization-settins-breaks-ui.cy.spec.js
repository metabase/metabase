import { restore, openQuestionActions } from "e2e/support/helpers";

const query = 'SELECT 1 AS "id", current_timestamp::timestamp AS "created_at"';

const emptyColumnsQuestionDetails = {
  native: {
    query,
  },
  displayIsLocked: true,
  visualization_settings: {
    "table.columns": [],
    "table.pivot_column": "orphaned1",
    "table.cell_column": "orphaned2",
  },
  type: "model",
};

describe("issue 23421", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("`visualization_settings` should not break UI (metabase#23421)", () => {
    cy.createNativeQuestion(emptyColumnsQuestionDetails, {
      visitQuestion: true,
    });
    openQuestionActions();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit query definition").click();

    cy.get(".ace_content").should("contain", query);
    cy.findByRole("columnheader", { name: "id" }).should("be.visible");
    cy.findByRole("columnheader", { name: "created_at" }).should("be.visible");
    cy.button("Save changes").should("be.disabled");
  });
});
