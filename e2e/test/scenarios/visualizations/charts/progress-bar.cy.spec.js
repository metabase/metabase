const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > progress chart", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should render progress bar in query builder and dashboard (metabase#40658, metabase#41243)", () => {
    const QUESTION_NAME = "40658";
    const questionDetails = {
      name: QUESTION_NAME,
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      display: "progress",
    };

    // check dashboard chart render
    H.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        // Make dashboard card really small (necessary for this repro as it doesn't show any labels)
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 5,
              size_y: 4,
              parameter_mappings: [],
            },
          ],
        });

        H.visitDashboard(dashboard_id);
      },
    );

    H.dashboardCards()
      .first()
      .within(() => {
        cy.findByText("18,760").should("be.visible");
        cy.findByText("Goal 0").should("be.visible");
        cy.findByText("Goal exceeded").should("be.visible");
      });

    // check query builder chart render
    H.dashboardCards().first().findByText(QUESTION_NAME).click();
    H.queryBuilderMain().within(() => {
      cy.findByText("18,760").should("be.visible");
      cy.findByText("Goal 0").should("be.visible");
      cy.findByText("Goal exceeded").should("be.visible");
    });
  });

  it("should allow value field selection with multiple numeric columns", () => {
    const questionDetails = {
      name: "Multi-column Progress Test",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
      },
      display: "progress",
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    // Open visualization settings
    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Display").click();

      // Should show Value field selector since we have multiple numeric columns
      cy.findByText("Value").should("be.visible");

      // Default should be first column (Count)
      cy.findByDisplayValue("Count").should("be.visible");

      // Change to Sum of Total
      cy.findByDisplayValue("Count").click();
    });

    H.popover().within(() => {
      cy.findByText("Sum of Total").click();
    });

    // Verify the field changed
    H.vizSettingsSidebar().within(() => {
      cy.findByDisplayValue("Sum of Total").should("be.visible");
    });
  });

  it("should not show value field selector with single numeric column", () => {
    const questionDetails = {
      name: "Single Column Progress Test",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      display: "progress",
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Display").click();

      // Should NOT show Value field selector since we only have one numeric column
      cy.findByText("Value").should("not.exist");

      // Goal setting should still be visible with no dropdown since no other columns
      cy.findByText("Goal").should("be.visible");

      // No dropdown icon should be visible since there are no other columns for goal
      cy.findByPlaceholderText("Enter goal value")
        .parent()
        .parent()
        .within(() => {
          cy.icon("chevrondown").should("not.exist");
        });
    });
  });

  it("should exclude value column from goal column options and include Custom value option", () => {
    const questionDetails = {
      name: "Exclusion Test Progress",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["count"],
          ["sum", ["field", ORDERS.TOTAL, null]],
          ["avg", ["field", ORDERS.QUANTITY, null]],
        ],
      },
      display: "progress",
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Display").click();

      // Set value field to Sum of Total
      cy.findByDisplayValue("Count").click();
    });

    H.popover().within(() => {
      cy.findByText("Sum of Total").click();
    });

    H.vizSettingsSidebar().within(() => {
      cy.findByText("Goal").parent().parent().icon("chevrondown").click();
    });

    // Should show Custom value, Count and Average of Quantity, but not Sum of Total
    H.popover().within(() => {
      cy.findByText("Custom value").should("be.visible");
      cy.findByText("Count").should("exist");
      cy.findByText("Average of Quantity").should("be.visible");
      cy.findByText("Sum of Total").should("not.exist");

      // Select Count
      cy.findByText("Count").click();
    });

    // Goal should show Count selected in the input
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Count").should("exist");
    });
  });

  it("should be backwards compatibile", () => {
    // A question with numeric `progress.goal` and no `progress.value` should render a progress bar with the goal value
    const questionDetails = {
      name: "Backwards Compat Test",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "progress",
      visualization_settings: {
        "progress.goal": 1000,
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.queryBuilderMain().within(() => {
      cy.findByText("18,760").should("be.visible");
      cy.contains("Goal 1,000").should("be.visible");
    });
  });

  it("should allow switching between custom value and column reference via dropdown", () => {
    const questionDetails = {
      name: "Custom Value Toggle Test",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
      },
      display: "progress",
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Display").click();

      // Initially should show number input with placeholder
      cy.findByPlaceholderText("Enter goal value").should("be.visible");

      // Click dropdown to select a column
      cy.findByText("Goal").parent().parent().icon("chevrondown").click();
    });

    // Select Sum of Total column
    H.popover().findByText("Sum of Total").click();

    // Should now show the column name in a read-only text input
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Sum of Total").should("exist");

      // Click dropdown again to switch back to custom value
      cy.findByText("Goal").parent().parent().icon("chevrondown").click();
    });

    H.popover().within(() => {
      cy.findByText("Custom value").click();
    });

    // Should be back to number input and it should be focused
    H.vizSettingsSidebar().within(() => {
      cy.findByPlaceholderText("Enter goal value")
        .should("exist")
        .should("have.focus");
    });
  });

  it("should handle native query with both value and goal columns", () => {
    const query = 'select 75000 as "value", 100000 as "goal";';

    H.visitQuestionAdhoc({
      display: "progress",
      dataset_query: {
        type: "native",
        native: {
          query,
        },
        database: SAMPLE_DATABASE.id,
      },
    });

    // Open visualization settings to configure value and goal columns
    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Display").click();

      // Configure goal to use the "goal" column
      cy.findByText("Goal").parent().parent().icon("chevrondown").click();
    });

    H.popover().findByText("goal").click();

    // Verify the progress bar displays correctly with native query data
    H.queryBuilderMain().within(() => {
      // Should show the first row's value
      cy.findByText("75,000").should("be.visible");
      // Should show goal from the goal column
      cy.findByText("Goal 100,000").should("be.visible");
    });
  });
});
