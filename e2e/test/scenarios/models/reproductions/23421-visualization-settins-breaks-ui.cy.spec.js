import { restore, openQuestionActions, popover } from "e2e/support/helpers";

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

const hiddenColumnsQuestionDetails = {
  native: {
    query,
  },
  displayIsLocked: true,
  visualization_settings: {
    "table.columns": [
      {
        name: "id",
        key: '["name","id"]',
        enabled: false,
        fieldRef: ["field", "id", { "base-type": "type/Integer" }],
      },
      {
        name: "created_at",
        key: '["name","created_at"]',
        enabled: false,
        fieldRef: ["field", "created_at", { "base-type": "type/DateTime" }],
      },
    ],
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
    popover().findByText("Edit query definition").click();

    cy.get(".ace_content").should("contain", query);
    cy.findByRole("columnheader", { name: "id" }).should("be.visible");
    cy.findByRole("columnheader", { name: "created_at" }).should("be.visible");
    cy.button("Save changes").should("be.disabled");
  });

  it("`visualization_settings` with hidden columns should not break UI (metabase#23421)", () => {
    cy.createNativeQuestion(hiddenColumnsQuestionDetails, {
      visitQuestion: true,
    });
    openQuestionActions();
    popover().findByText("Edit query definition").click();

    cy.get(".ace_content").should("contain", query);
    cy.findByTestId("visualization-root")
      .findByText("Every field is hidden right now")
      .should("be.visible");
    cy.button("Save changes").should("be.disabled");
  });
});
