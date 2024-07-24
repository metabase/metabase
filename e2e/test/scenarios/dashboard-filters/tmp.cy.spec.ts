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

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_COUNT_OVER_TIME: StructuredQuestionDetails = {
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        {
          "base-type": "type/DateTime",
          "temporal-unit": "month",
        },
      ],
    ],
  },
};

const CREATED_AT_FIELD: LocalFieldReference = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

describe("scenarios > dashboard > filters > clear & reset buttons", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("temporal unit parameters", () => {
    createDashboardWithParameters(ORDERS_COUNT_OVER_TIME, [
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

    cy.log("no default value, non-required - no value");
    clearButton(noDefaultNonRequired).should("not.exist");
    resetButton(noDefaultNonRequired).should("not.exist");
    chevronIcon(noDefaultNonRequired).should("be.visible");

    cy.log("no default value, non-required - value");
    filter(noDefaultNonRequired).click();
    popover().findByText("Month").click();
    clearButton(noDefaultNonRequired).should("be.visible");
    resetButton(noDefaultNonRequired).should("not.exist");
    chevronIcon(noDefaultNonRequired).should("not.exist");
    filter(noDefaultNonRequired).should("have.text", "Month");
    clearButton(noDefaultNonRequired).click();
    filter(noDefaultNonRequired).should("have.text", noDefaultNonRequired);

    const defaultNonRequired = "default value, non-required";

    cy.log("default value, non-required - value same as default");
    clearButton(defaultNonRequired).should("be.visible");
    resetButton(defaultNonRequired).should("not.exist");
    chevronIcon(defaultNonRequired).should("not.exist");
    filter(defaultNonRequired).should("have.text", "Year");
    clearButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", defaultNonRequired);

    cy.log("default value, non-required - no value");
    clearButton(defaultNonRequired).should("not.exist");
    // resetButton(defaultValueNonRequired).should("be.visible"); // new behavior
    // chevronIcon(defaultValueNonRequired).should("not.exist"); // new behavior
    // TODO: test the button

    cy.log("default value, non-required - value different than default");
    filter(defaultNonRequired).click();
    popover().findByText("Month").click();
    // clearButton(defaultValueNonRequired).should("not.exist"); // new behavior
    // resetButton(defaultValueNonRequired).should("be.visible"); // new behavior
    chevronIcon(defaultNonRequired).should("not.exist");
    // TODO: test the button

    const defaultRequired = "default value, required";

    cy.log("default value, required - value same as default");
    clearButton(defaultRequired).should("not.exist");
    resetButton(defaultRequired).should("not.exist");
    chevronIcon(defaultRequired).should("not.exist");

    cy.log("default value, required - value different than default");
    filter(defaultRequired).click();
    popover().findByText("Month").click();
    clearButton(defaultRequired).should("not.exist");
    resetButton(defaultRequired).should("be.visible");
    chevronIcon(defaultRequired).should("not.exist");
    filter(defaultRequired).should("have.text", "Month");
    resetButton(defaultRequired).click();
    filter(defaultRequired).should("have.text", "Year");
  });

  it("time parameters", () => {
    createDashboardWithParameters(ORDERS_COUNT_OVER_TIME, [
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

    cy.log("no default value, non-required - no value");
    clearButton(noDefaultNonRequired).should("not.exist");
    resetButton(noDefaultNonRequired).should("not.exist");
    chevronIcon(noDefaultNonRequired).should("be.visible");

    cy.log("no default value, non-required - value");
    filter(noDefaultNonRequired).click();
    popover().findByRole("textbox").clear().type("01/01/2024").blur();
    popover().button("Add filter").click();
    clearButton(noDefaultNonRequired).should("be.visible");
    resetButton(noDefaultNonRequired).should("not.exist");
    chevronIcon(noDefaultNonRequired).should("not.exist");
    filter(noDefaultNonRequired).should("have.text", "January 1, 2024");
    clearButton(noDefaultNonRequired).click();
    filter(noDefaultNonRequired).should("have.text", noDefaultNonRequired);

    const defaultNonRequired = "default value, non-required";

    cy.log("default value, non-required - value same as default");
    clearButton(defaultNonRequired).should("be.visible");
    resetButton(defaultNonRequired).should("not.exist");
    chevronIcon(defaultNonRequired).should("not.exist");
    filter(defaultNonRequired).should("have.text", "January 1, 2024");
    clearButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", defaultNonRequired);

    cy.log("default value, non-required - no value");
    clearButton(defaultNonRequired).should("not.exist");
    // resetButton(defaultValueNonRequired).should("be.visible"); // new behavior
    // chevronIcon(defaultValueNonRequired).should("not.exist"); // new behavior
    // TODO: test the button

    cy.log("default value, non-required - value different than default");
    filter(defaultNonRequired).click();
    popover().findByRole("textbox").clear().type("01/01/2020").blur();
    popover().button("Update filter").click();
    // clearButton(defaultValueNonRequired).should("not.exist"); // new behavior
    // resetButton(defaultValueNonRequired).should("be.visible"); // new behavior
    chevronIcon(defaultNonRequired).should("not.exist");
    // TODO: test the button

    const defaultRequired = "default value, required";

    cy.log("default value, required - value same as default");
    clearButton(defaultRequired).should("not.exist");
    resetButton(defaultRequired).should("not.exist");
    chevronIcon(defaultRequired).should("not.exist");

    cy.log("default value, required - value different than default");
    filter(defaultRequired).click();
    popover().findByRole("textbox").clear().type("01/01/2020").blur();
    popover().button("Update filter").click();
    clearButton(defaultRequired).should("not.exist");
    resetButton(defaultRequired).should("be.visible");
    chevronIcon(defaultRequired).should("not.exist");
    filter(defaultRequired).should("have.text", "January 1, 2020");
    resetButton(defaultRequired).click();
    filter(defaultRequired).should("have.text", "January 1, 2024");
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
              target: ["dimension", CREATED_AT_FIELD],
            })),
          },
        ],
      });

      visitDashboard(dashboard_id);
    });
  }
});
