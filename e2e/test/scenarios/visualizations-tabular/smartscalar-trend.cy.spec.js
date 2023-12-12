import Color from "color";
import { colors } from "metabase/lib/colors";
import { menu, popover, restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

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
          aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
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
      // should only have two options
      cy.get('[role="option"]').should("have.length", 2);

      // selected should be highlighted
      cy.get('[aria-label="Count"]').should(
        "have.css",
        "background-color",
        Color(colors.brand).string(),
      );

      // should not be highlighted b/c not selected
      cy.get('[aria-label="Sum of Total"]').should(
        "have.css",
        "background-color",
        Color().alpha(0).string(),
      );
      cy.findByText("Sum of Total").click();
    });
    cy.findByTestId("scalar-container").findByText("30,759.47");

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
      cy.get("input").click().type("100{enter}");
      cy.get("input").should("have.value", 48);

      // should clamp under input to 2
      cy.get("input").click().type("-45{enter}");
      cy.get("input").should("have.value", 2);

      // should not allow invalid input
      cy.get("input").click().type("3.90293{enter}");
      cy.get("input").should("have.value", 2);

      // should allow valid input
      cy.get("input").click().type("3{enter}");
    });
    cy.findByTestId("scalar-previous-value").within(() => {
      cy.findByText("vs. Jan:");
      cy.findByText("52,249.59");
    });
  });

  it("should allow display settings to be changed and display should reflect changes", () => {
    cy.createQuestion(
      {
        name: "13710",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        display: "smartscalar",
      },
      { visitQuestion: true },
    );

    // scalar.switch_positive_negative setting
    cy.get('[aria-label="arrow_down icon"]').should(
      "have.css",
      "color",
      Color(colors.error).string(),
    );
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findByText("Display").click();
      cy.findByLabelText("Switch positive / negative colors?").click();
    });
    cy.get('[aria-label="arrow_down icon"]').should(
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
  });

  it("should have data settings disabled if only one option to choose from", () => {
    // create native question with irregular time periods
    cy.createNativeQuestion(
      {
        name: "13710",
        native: {
          query:
            "SELECT '2026-03-01'::date as date, 22 as \"Value\"\nUNION ALL\nSELECT '2026-04-01'::date, 44\nUNION ALL\nSELECT '2026-06-04'::date, 41",
        },
        display: "smartscalar",
      },
      { visitQuestion: true },
    );

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar").findByText("Data").click();

    cy.findByTestId("chartsettings-sidebar").within(() => {
      // only one primary number option
      cy.findByTestId("select-button").should("be.disabled");

      // only one comparison option
      cy.findByTestId("comparisons-widget-button").should("be.disabled");
    });
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
