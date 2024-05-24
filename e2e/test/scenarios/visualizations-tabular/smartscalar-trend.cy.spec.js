import Color from "color";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  cartesianChartCircle,
  createNativeQuestion,
  menu,
  popover,
  queryBuilderMain,
  restore,
  rightSidebar,
  summarize,
} from "e2e/support/helpers";
import { colors } from "metabase/lib/colors";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const BIG_NUMBER_AGGREGATION = [
  "aggregation-options",
  ["*", ["count"], 10000],
  { name: "Mega Count", "display-name": "Mega Count" },
];

const AGGREGATIONS = [
  ["count"],
  ["sum", ["field", ORDERS.TOTAL, null]],
  BIG_NUMBER_AGGREGATION,
];

describe("scenarios > visualizations > trend chart (SmartScalar)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow data settings to be changed and display should reflect changes", () => {
    cy.createQuestion(
      {
        name: "13710",
        query: {
          "source-table": ORDERS_ID,
          aggregation: AGGREGATIONS,
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        display: "smartscalar",
      },
      { visitQuestion: true },
    );

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar").findByText("Data").click();

    // primary number
    cy.findByTestId("scalar-container").findByText("344");
    cy.findByTestId("chartsettings-sidebar").findByText("Count").click();
    popover().within(() => {
      cy.findAllByRole("option").should("have.length", AGGREGATIONS.length);

      // selected should be highlighted
      cy.findByLabelText("Count").should("have.attr", "aria-selected", "true");

      // should not be highlighted b/c not selected
      cy.findByLabelText("Sum of Total").should(
        "have.attr",
        "aria-selected",
        "false",
      );
      cy.findByText("Sum of Total").click();
    });

    // comparisons
    // default should be previous period (since we have a dateUnit)
    cy.findByTestId("scalar-container").findByText("30,759.47");
    cy.findByTestId("scalar-previous-value").within(() => {
      cy.findByText("vs. previous month:");
      cy.findByText("45,683.68");
    });

    // previous value
    cy.findByTestId("chartsettings-sidebar")
      .findByText("Previous month")
      .click();
    menu().findByText("Previous value").click();
    cy.findByTestId("scalar-previous-value").within(() => {
      cy.findByText("vs. Mar:");
      cy.findByText("45,683.68");
    });

    // periods ago
    cy.findByTestId("chartsettings-sidebar")
      .findByText("Previous value")
      .click();
    menu().within(() => {
      // should clamp over input to maxPeriodsAgo
      cy.get("input").click().type("100");
      cy.get("input").should("have.value", 48);

      // should clamp under input to 2
      cy.get("input").click().type("0");
      cy.get("input").should("have.value", 2);

      // should not allow invalid input and floor to round the number
      cy.get("input").click().type("4.9");
      cy.get("input").should("have.value", 4);

      // should allow valid input
      cy.get("input").click().type("3{enter}");
    });
    cy.findByTestId("scalar-previous-value").within(() => {
      cy.findByText("vs. Jan:");
      cy.findByText("52,249.59");
    });

    // static number
    cy.findByTestId("chartsettings-sidebar").findByText("3 months ago").click();
    menu().within(() => {
      cy.findByText("Custom value…").click();

      // Test the back button
      cy.findByLabelText("Back").click();
      cy.findByText("Custom value…").click();

      cy.findByLabelText("Label").type("My Goal");
      cy.findByLabelText("Value").type("{selectall}42000");
      cy.button("Done").click();
    });
    cy.findByTestId("scalar-previous-value").within(() => {
      cy.findByText("vs. My Goal:").should("exist");
      cy.findByText("42,000").should("exist"); // goal
      cy.findByText("26.76%").should("exist"); // down percentage
    });
    cy.findByTestId("chartsettings-sidebar").findByText("(My Goal)").click();
    menu().within(() => {
      cy.findByLabelText("Back").should("exist");
      cy.findByLabelText("Label").should("have.value", "My Goal");
      cy.findByLabelText("Value").should("have.value", "42000");
      cy.button("Back").click();
    });

    // another column
    menu().findByText("Value from another column…").click();
    popover().findByText("Mega Count").click();
    menu().button("Done").click();

    cy.findByTestId("scalar-previous-value").within(() => {
      cy.findByText("vs. Mega Count:").should("exist");
      cy.findByText("3,440,000").should("exist"); // goal
      cy.findByText("99.11%").should("exist"); // down percentage
    });

    cy.findByTestId("chartsettings-sidebar").findByText("(Mega Count)").click();
    menu().findByLabelText("Column").click();
    popover().findByText("Count").click();
    menu().button("Done").click();

    cy.findByTestId("scalar-previous-value").within(() => {
      cy.findByText("vs. Count:").should("exist");
      cy.findByText("344").should("exist"); // goal
      cy.findByText("8,841.71%").should("exist"); // up percentage
    });
  });

  it("should handle up to 3 comparisons", () => {
    cy.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: AGGREGATIONS,
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        display: "smartscalar",
      },
      { visitQuestion: true },
    );

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("comparison-list").children().should("have.length", 1);

    cy.findByTestId("scalar-previous-value").within(() => {
      cy.findByText("34.72%").should("exist");
      cy.findByText("vs. previous month:").should("exist");
      cy.findByText("527").should("exist");
    });

    cy.button("Add comparison").click();
    cy.findByTestId("comparison-list").children().should("have.length", 2);
    menu().findByText("months ago").click();
    cy.findAllByTestId("scalar-previous-value")
      .children()
      .should("have.length", 2)
      .last()
      .within(() => {
        cy.findByText("36.65%").should("exist");
        cy.findByText("vs. Feb:").should("exist");
        cy.findByText("543").should("exist");
      });

    cy.button("Add comparison").click();
    cy.findByTestId("comparison-list").children().should("have.length", 3);
    menu().findByText("Previous value").click();
    cy.findAllByTestId("scalar-previous-value")
      .children()
      .should("have.length", 3)
      .last()
      .within(() => {
        cy.findByText("34.72%").should("exist");
        cy.findByText("vs. Mar:").should("exist");
        cy.findByText("527").should("exist");
      });

    cy.button("Add comparison").should("be.disabled");

    cy.findByTestId("comparison-list")
      .children()
      .last()
      .findByLabelText("Remove")
      .click();
    cy.findByTestId("comparison-list").children().should("have.length", 2);
    cy.findByTestId("comparison-list")
      .findByText("Previous value")
      .should("not.exist");
    cy.findAllByTestId("scalar-previous-value")
      .children()
      .should("have.length", 2);
    cy.findAllByTestId("scalar-previous-value")
      .findByText("vs. Mar:")
      .should("not.exist");

    cy.button("Add comparison").should("be.enabled");
  });

  it("should reset 'another column' comparison when it becomes invalid", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: AGGREGATIONS,
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        display: "smartscalar",
        visualization_settings: {
          "scalar.field": "Count",
          "scalar.comparisons": [
            {
              id: "1",
              type: "anotherColumn",
              column: "Mega Count",
              label: "Mega Count",
            },
            {
              id: "2",
              type: "staticNumber",
              value: 400000,
              label: "Goal",
            },
          ],
        },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("viz-settings-button").click();

    // Selecting the main column ("Mega Count") to be the comparison column
    // The "Another column (Mega Count)" comparison should disappear
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findByText("(Mega Count)").should("exist");
      cy.findByText("Count").click();
    });
    popover().findByText("Mega Count").click();

    cy.findByTestId("scalar-value").should("have.text", "3,440,000");
    cy.findByTestId("scalar-previous-value").within(() => {
      cy.findByText("Sum of Total").should("not.exist");
      cy.findByText("vs. Goal:").should("exist");
      cy.findByText("400,000").should("exist");
    });

    // Replacing "Custom value (Goal)" with "Another column (Count)"
    // Setting the main column to "Count"
    // The single invalid comparison should be reset to "previous period"
    cy.findByTestId("chartsettings-sidebar")
      .findByText(/Custom value/)
      .click();
    menu().button("Back").click();
    menu().findByText("Value from another column…").click();
    popover().findByText("Count").click();
    popover().button("Done").click();

    cy.findByTestId("chartsettings-sidebar").findByText("Mega Count").click();
    popover().findByText("Count").click();

    cy.findByTestId("scalar-value").should("have.text", "344");
    cy.findByTestId("scalar-previous-value").within(() => {
      cy.findByText("Count").should("not.exist");
      cy.findByText("vs. previous month:").should("exist");
      cy.findByText("527").should("exist");
    });

    cy.findByTestId("chartsettings-sidebar")
      .findByText("Previous month")
      .click();
    menu().findByText("Value from another column…").click();
    popover().findByText("Sum of Total").click();
    popover().button("Done").click();

    cy.findByTestId("chartsettings-sidebar").findByText("Count").click();
    popover().findByText("Mega Count").click();

    // Removing the comparison column ("Sum of Total") from the query
    // The comparison should be reset to "previous period"
    summarize();
    rightSidebar().findByLabelText("Sum of Total").icon("close").click();
    cy.wait("@dataset");

    cy.findByTestId("scalar-value").should("have.text", "3,440,000");
    cy.findByTestId("scalar-previous-value").within(() => {
      cy.findByText("Sum of Total").should("not.exist");
      cy.findByText("vs. previous month:").should("exist");
      cy.findByText("5,270,000").should("exist");
    });

    // Removing the remaining numeric column, so only Count is left
    // to ensure we no longer offer the "Value from another column…" option
    rightSidebar().within(() => {
      cy.findByLabelText("Count").icon("close").click();
      cy.button("Done").click();
    });
    cy.wait("@dataset");

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findByText("Sum of Total").should("not.exist");
      cy.findByText("Previous month").should("exist").click();
    });
    menu().findByText("Value from another column…").should("not.exist");
  });

  it("should allow display settings to be changed and display should reflect changes", () => {
    cy.createQuestion(
      {
        name: "13710",
        query: {
          "source-table": ORDERS_ID,
          aggregation: AGGREGATIONS,
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        display: "smartscalar",
      },
      { visitQuestion: true },
    );

    // scalar.switch_positive_negative setting
    cy.icon("arrow_down").should(
      "have.css",
      "color",
      Color(colors.error).string(),
    );
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findByText("Display").click();
      cy.findByLabelText("Switch positive / negative colors?").click();
    });
    cy.icon("arrow_down").should(
      "have.css",
      "color",
      Color(colors.success).string(),
    );

    // style
    cy.findByTestId("scalar-container").findByText("344");
    cy.findByLabelText("Style").click();
    popover().findByText("Percent").click();
    cy.findByTestId("scalar-container").findByText("34,400%");

    // separator style
    cy.findByLabelText("Separator style").click();
    popover().findByText("100’000.00").click();
    cy.findByTestId("scalar-container").findByText("34’400%");

    // decimal places
    cy.findByLabelText("Minimum number of decimal places")
      .click()
      .type("4")
      .blur();
    cy.findByTestId("scalar-container").findByText("34’400.0000%");

    // multiply by a number
    cy.findByLabelText("Multiply by a number").click().type("2").blur();
    cy.findByTestId("scalar-container").findByText("68’800.0000%");

    // add a prefix
    cy.findByLabelText("Add a prefix").click().type("Woah: ").blur();
    cy.findByTestId("scalar-container").findByText("Woah: 68’800.0000%");

    // add a suffix
    cy.findByLabelText("Add a suffix").click().type(" ! cool").blur();
    cy.findByTestId("scalar-container").findByText("Woah: 68’800.0000% ! cool");

    // scalar.compact_primary_number setting
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findByText("Data").click();
      cy.findByText("Count").click();
    });
    popover().findByRole("option", { name: "Mega Count" }).click();
    cy.findByTestId("chartsettings-sidebar").findByText("Display").click();

    cy.findByTestId("scalar-container").findByText("3,440,000");
    cy.findByTestId("scalar-previous-value").findByText("5,270,000");

    cy.findByTestId("chartsettings-sidebar")
      .findByLabelText("Compact number")
      .click();
    cy.findByTestId("scalar-container").findByText("3.4M");
    cy.findByTestId("scalar-previous-value").findByText("5.3M");

    cy.findByTestId("chartsettings-sidebar")
      .findByLabelText("Compact number")
      .click();
    cy.findByTestId("scalar-container").findByText("3,440,000");
    cy.findByTestId("scalar-previous-value").findByText("5,270,000");
  });

  it("should work regardless of column order (metabase#13710)", () => {
    cy.createQuestion(
      {
        name: "13710",
        query: {
          "source-table": ORDERS_ID,
          breakout: [
            ["field", ORDERS.QUANTITY, null],
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        display: "smartscalar",
      },
      { visitQuestion: true },
    );

    cy.log("Reported failing on v0.35 - v0.37.0.2");
    cy.log("Bug: showing blank visualization");

    cy.findByTestId("scalar-value").contains("100");
  });

  it("should gracefully handle errors (metabase#42948)", () => {
    createNativeQuestion(
      {
        name: "42948",
        native: {
          query:
            "SELECT DATE '2024-05-21' AS created_at, 5 as v\nUNION ALL SELECT DATE '2024-05-20' , 4\nUNION ALL SELECT DATE '2024-05-19' , 3\nORDER BY created_at",
        },

        display: "smartscalar",
        visualization_settings: {
          "scalar.field": "v",
          "scalar.comparisons": [
            {
              id: "1",
              type: "periodsAgo",
              value: "this will cause an error because it is not a number",
            },
          ],
        },
      },
      { visitQuestion: true },
    );

    // check that error/warning is showing up
    cy.icon("warning").realHover();
    queryBuilderMain().findByText(
      "No integer value supplied for periods ago comparison.",
    );

    // check that we can switch to the table view and the data is shown
    cy.findByLabelText("Switch to data").click();
    queryBuilderMain().within(() => {
      cy.findByText("CREATED_AT").should("be.visible");
      cy.findByText("V").should("be.visible");
    });

    // check that we can switch visualizations and no longer have the error show
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("Line-button").click();
    cy.icon("warning").should("not.exist");
    cartesianChartCircle().should("have.length", 3);
  });
});
