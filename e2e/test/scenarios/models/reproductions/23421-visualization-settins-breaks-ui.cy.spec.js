import { restore, openQuestionActions } from "e2e/support/helpers";

const query = 'SELECT 1 AS "id", current_timestamp::timestamp AS "created_at"';

const questionDetails = {
  native: {
    query,
  },
  displayIsLocked: true,
  visualization_settings: {
    "table.columns": [],
    "table.pivot_column": "orphaned1",
    "table.cell_column": "orphaned2",
  },
  dataset: true,
};

describe("issue 23421", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("`visualization_settings` should not break UI (metabase#23421)", () => {
    openQuestionActions();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit query definition").click();

    cy.get(".ace_content").should("contain", query);
    cy.get(".cellData").should("have.length", 4);

    cy.button("Save changes").should("be.disabled");
  });
});
