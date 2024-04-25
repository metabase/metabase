import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { popover, restore } from "e2e/support/helpers";
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe.skip("issue 12496", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });
  const datePickerInput = (picker, input) =>
    cy
      .findAllByTestId("specific-date-picker")
      .eq(picker)
      .find("input")
      .eq(input);
  const setup = unit => {
    cy.createQuestion(
      {
        name: `Orders by Created At: ${unit}`,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": unit }]],
          filter: [
            "between",
            ["field", ORDERS.CREATED_AT, null],
            "2022-04-01",
            "2022-05-31",
          ],
        },
        display: "line",
      },
      { visitQuestion: true },
    );
    // When a filter is added above, we have to unhide the filter pills:
    cy.findByTestId("filters-visibility-control").click();
  };
  it("should display correct day range in filter pill when drilling into a week", () => {
    setup("week");
    cy.get(".dot").eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 24–30, 2022")
      .click();
    popover().within(() => {
      cy.findByTestId("between-date-picker").within(() => {
        datePickerInput(0, 0).should("have.value", "04/24/2022");
        datePickerInput(1, 0).should("have.value", "04/30/2022");
      });
    });
  });
  it("should display correct day range in filter pill when drilling into a month", () => {
    setup("month");
    cy.get(".dot").eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 2022")
      .click();
    popover().within(() => {
      cy.findByTestId("between-date-picker").within(() => {
        datePickerInput(0, 0).should("have.value", "04/01/2022");
        datePickerInput(1, 0).should("have.value", "04/30/2022");
      });
    });
  });
  it("should display correct day range in filter pill when drilling into a hour", () => {
    setup("hour");
    cy.get(".dot").eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 30, 2022, 6:00–59 PM")
      .click();
    popover().within(() => {
      cy.findByTestId("between-date-picker").within(() => {
        datePickerInput(0, 0).should("have.value", "04/30/2022");
        datePickerInput(0, 1).should("have.value", "6");
        datePickerInput(0, 2).should("have.value", "00");
        datePickerInput(1, 0).should("have.value", "04/30/2022");
        datePickerInput(1, 1).should("have.value", "6");
        datePickerInput(1, 2).should("have.value", "59");
      });
    });
  });
  it("should display correct minute in filter pill when drilling into a minute", () => {
    setup("minute");
    cy.get(".dot").eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 30, 2022, 6:56 PM")
      .click();
    popover().within(() => {
      datePickerInput(0, 0).should("have.value", "04/30/2022");
      datePickerInput(0, 1).should("have.value", "6");
      datePickerInput(0, 2).should("have.value", "56");
    });
  });
  it("should display correct minute in filter pill when drilling into a day", () => {
    setup("day");
    cy.get(".dot").eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 30, 2022")
      .click();
    popover().within(() => {
      datePickerInput(0, 0).should("have.value", "04/30/2022");
    });
  });
});
