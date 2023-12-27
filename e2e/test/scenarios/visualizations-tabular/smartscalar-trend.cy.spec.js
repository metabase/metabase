import Color from "color";
import { colors } from "metabase/lib/colors";
import { menu, popover, restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
      cy.findByText("vs. my goal:").should("exist");
      cy.findByText("42,000").should("exist"); // goal
      cy.findByText("26.76%").should("exist"); // down percentage
    });
    cy.findByTestId("chartsettings-sidebar").findByText("My Goal").click();
    menu().within(() => {
      cy.findByLabelText("Back").should("exist");
      cy.findByLabelText("Label").should("have.value", "My Goal");
      cy.findByLabelText("Value").should("have.value", "42000");
    });
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

    cy.findByTestId("chartsettings-sidebar")
      .findByLabelText("Compact number")
      .click();
    cy.findByTestId("scalar-container").findByText("3.4M");

    cy.findByTestId("chartsettings-sidebar")
      .findByLabelText("Compact number")
      .click();
    cy.findByTestId("scalar-container").findByText("3,440,000");
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

    cy.get(".ScalarValue").contains("100");
  });
});
