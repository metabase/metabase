// TODO: merge this file into another file

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestionAndDashboard,
  popover,
  restore,
  updateDashboardCards,
  visitDashboard,
  type DashboardDetails,
  type StructuredQuestionDetails,
} from "e2e/support/helpers";
import { checkNotNull } from "metabase/lib/types";
import type { LocalFieldReference } from "metabase-types/api";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const CREATED_AT_FIELD: LocalFieldReference = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

const CITY_FIELD: LocalFieldReference = [
  "field",
  PEOPLE.CITY,
  {
    "base-type": "type/Text",
  },
];

const ORDERS_COUNT_OVER_TIME: StructuredQuestionDetails = {
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [CREATED_AT_FIELD],
  },
};

const PEOPLE_QUESTION: StructuredQuestionDetails = {
  query: {
    "source-table": PEOPLE_ID,
    limit: 1,
  },
};

describe("scenarios > dashboard > filters > clear & reset buttons", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("temporal unit parameters", () => {
    createDashboardWithParameters(ORDERS_COUNT_OVER_TIME, CREATED_AT_FIELD, [
      {
        name: "no default value, non-required",
        slug: "no-default-value/non-required",
        id: "fed1b910",
        type: "temporal-unit",
        sectionId: "temporal-unit",
      },
      {
        name: "default value, non-required",
        slug: "default-value/non-required",
        id: "75d67d30",
        type: "temporal-unit",
        sectionId: "temporal-unit",
        default: "year",
      },
      {
        name: "default value, required",
        slug: "default-value/required",
        id: "60f12ac2",
        type: "temporal-unit",
        sectionId: "temporal-unit",
        default: "year",
        required: true,
      },
    ]);

    const noDefaultNonRequired = "no default value, non-required";

    cy.log("no default value, non-required, no current value");
    checkButtonVisible(noDefaultNonRequired, "chevron");

    cy.log("no default value, non-required, has current value");
    filter(noDefaultNonRequired).click();
    popover().findByText("Month").click();
    checkButtonVisible(noDefaultNonRequired, "clear");
    filter(noDefaultNonRequired).should("have.text", "Month");
    clearButton(noDefaultNonRequired).click();
    filter(noDefaultNonRequired).should("have.text", noDefaultNonRequired);

    const defaultNonRequired = "default value, non-required";

    cy.log("has default value, non-required, value same as default");
    checkButtonVisible(defaultNonRequired, "clear");
    filter(defaultNonRequired).should("have.text", "Year");
    clearButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", defaultNonRequired);

    cy.log("has default value, non-required, no current value");
    // assertVisibleButton(noDefaultNonRequired, "reset"); // new behavior
    // TODO: test the button

    cy.log(
      "has default value, non-required, current value different than default",
    );
    filter(defaultNonRequired).click();
    popover().findByText("Month").click();
    // assertVisibleButton(noDefaultNonRequired, "reset"); // new behavior
    // TODO: test the button

    const defaultRequired = "default value, required";

    cy.log("has default value, required, value same as default");
    checkButtonVisible(defaultRequired, "none");

    cy.log("has default value, required, current value different than default");
    filter(defaultRequired).click();
    popover().findByText("Month").click();
    checkButtonVisible(defaultRequired, "reset");
    filter(defaultRequired).should("have.text", "Month");
    resetButton(defaultRequired).click();
    filter(defaultRequired).should("have.text", "Year");
  });

  it("time parameters", () => {
    createDashboardWithParameters(ORDERS_COUNT_OVER_TIME, CREATED_AT_FIELD, [
      {
        name: "no default value, non-required",
        slug: "no-default-value/non-required",
        id: "fed1b910",
        type: "date/single",
        sectionId: "date",
      },
      {
        name: "default value, non-required",
        slug: "default-value/non-required",
        id: "75d67d30",
        type: "date/single",
        sectionId: "date",
        default: "2024-01-01",
      },
      {
        name: "default value, required",
        slug: "default-value/required",
        id: "60f12ac2",
        type: "date/single",
        sectionId: "date",
        default: "2024-01-01",
        required: true,
      },
    ]);

    const noDefaultNonRequired = "no default value, non-required";

    cy.log("no default value, non-required, no current value");
    checkButtonVisible(noDefaultNonRequired, "chevron");

    cy.log("no default value, non-required, has current value");
    filter(noDefaultNonRequired).click();
    popover().findByRole("textbox").clear().type("01/01/2024").blur();
    popover().button("Add filter").click();
    checkButtonVisible(noDefaultNonRequired, "clear");
    filter(noDefaultNonRequired).should("have.text", "January 1, 2024");
    clearButton(noDefaultNonRequired).click();
    filter(noDefaultNonRequired).should("have.text", noDefaultNonRequired);

    const defaultNonRequired = "default value, non-required";

    cy.log("has default value, non-required, value same as default");
    checkButtonVisible(defaultNonRequired, "clear");
    filter(defaultNonRequired).should("have.text", "January 1, 2024");
    clearButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", defaultNonRequired);

    cy.log("has default value, non-required, no current value");
    // assertVisibleButton(noDefaultNonRequired, "reset"); // new behavior
    // TODO: test the button

    cy.log(
      "has default value, non-required, current value different than default",
    );
    filter(defaultNonRequired).click();
    popover().findByRole("textbox").clear().type("01/01/2020").blur();
    popover().button("Update filter").click();
    // assertVisibleButton(noDefaultNonRequired, "reset"); // new behavior
    // TODO: test the button

    const defaultRequired = "default value, required";

    cy.log("has default value, required, value same as default");
    checkButtonVisible(defaultRequired, "none");

    cy.log("has default value, required, current value different than default");
    filter(defaultRequired).click();
    popover().findByRole("textbox").clear().type("01/01/2020").blur();
    popover().button("Update filter").click();
    checkButtonVisible(defaultRequired, "reset");
    filter(defaultRequired).should("have.text", "January 1, 2020");
    resetButton(defaultRequired).click();
    filter(defaultRequired).should("have.text", "January 1, 2024");
  });

  it("location parameters - multiple values", () => {
    createDashboardWithParameters(PEOPLE_QUESTION, CITY_FIELD, [
      {
        name: "no default value, non-required",
        slug: "no-default-value/non-required",
        id: "fed1b910",
        type: "string/=",
        sectionId: "location",
      },
      {
        name: "default value, non-required",
        slug: "default-value/non-required",
        id: "75d67d30",
        type: "string/=",
        sectionId: "location",
        default: ["Bassett", "Thomson"],
      },
      {
        name: "default value, required",
        slug: "default-value/required",
        id: "60f12ac2",
        type: "string/=",
        sectionId: "location",
        required: true,
        default: ["Bassett", "Thomson"],
      },
    ]);

    const noDefaultNonRequired = "no default value, non-required";

    cy.log("no default value, non-required, no current value");
    checkButtonVisible(noDefaultNonRequired, "chevron");

    cy.log("no default value, non-required, has current value");
    filter(noDefaultNonRequired).click();
    popover().findByRole("searchbox").clear().type("Bassett,Thomson").blur();
    popover().button("Add filter").click();
    checkButtonVisible(noDefaultNonRequired, "clear");
    filter(noDefaultNonRequired).should("have.text", "2 selections");
    clearButton(noDefaultNonRequired).click();
    filter(noDefaultNonRequired).should("have.text", noDefaultNonRequired);

    const defaultNonRequired = "default value, non-required";

    cy.log("has default value, non-required, value same as default");
    checkButtonVisible(defaultNonRequired, "clear");
    filter(defaultNonRequired).should("have.text", "2 selections");
    clearButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", defaultNonRequired);

    cy.log("has default value, non-required, no current value");
    // assertVisibleButton(noDefaultNonRequired, "reset"); // new behavior
    // TODO: test the button

    cy.log(
      "has default value, non-required, current value different than default",
    );
    filter(defaultNonRequired).click();
    popover().findByRole("searchbox").clear().type("Bassett").blur();
    popover().button("Update filter").click();
    // assertVisibleButton(noDefaultNonRequired, "reset"); // new behavior
    // TODO: test the button

    const defaultRequired = "default value, required";

    cy.log("has default value, required, value same as default");
    checkButtonVisible(defaultRequired, "none");

    cy.log("has default value, required, current value different than default");
    filter(defaultRequired).click();
    popover().findByRole("searchbox").focus().type("Washington").blur();
    popover().button("Update filter").click();
    checkButtonVisible(defaultRequired, "reset");
    filter(defaultRequired).should("have.text", "3 selections");
    resetButton(defaultRequired).click();
    filter(defaultRequired).should("have.text", "2 selections");
  });

  function filter(label: string) {
    return cy.findByLabelText(label);
  }

  function clearButton(label: string) {
    return filter(label).icon("close");
  }

  function resetButton(label: string) {
    return filter(label).icon("time_history");
  }

  function chevronIcon(label: string) {
    return filter(label).icon("chevrondown");
  }

  function createDashboardWithParameters(
    questionDetails: StructuredQuestionDetails,
    targetField: LocalFieldReference,
    parameters: DashboardDetails["parameters"],
  ) {
    createQuestionAndDashboard({
      questionDetails,
      dashboardDetails: {
        parameters,
      },
    }).then(({ body: { dashboard_id, card_id } }) => {
      updateDashboardCards({
        dashboard_id,
        cards: [
          {
            parameter_mappings: parameters?.map(parameter => ({
              parameter_id: parameter.id,
              card_id: checkNotNull(card_id),
              target: ["dimension", targetField],
            })),
          },
        ],
      });

      visitDashboard(dashboard_id);
    });
  }

  function checkButtonVisible(
    label: string,
    /**
     * Use 'none' when no button should be visible.
     */
    button: "chevron" | "reset" | "clear" | "none",
  ) {
    clearButton(label).should(button === "clear" ? "be.visible" : "not.exist");

    resetButton(label).should(button === "reset" ? "be.visible" : "not.exist");

    chevronIcon(label).should(
      button === "chevron" ? "be.visible" : "not.exist",
    );
  }
});
