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

    const defaultValueNonRequired = "default value, non-required";

    cy.log("default value, non-required - value same as default");
    clearButton(defaultValueNonRequired).should("be.visible");
    resetButton(defaultValueNonRequired).should("not.exist");
    chevronIcon(defaultValueNonRequired).should("not.exist");
    filter(defaultValueNonRequired).should("have.text", "Year");
    clearButton(defaultValueNonRequired).click();
    filter(defaultValueNonRequired).should(
      "have.text",
      defaultValueNonRequired,
    );

    cy.log("default value, non-required - no value");
    clearButton(defaultValueNonRequired).should("not.exist");
    // resetButton(defaultValueNonRequired).should("be.visible"); // new behavior
    // chevronIcon(defaultValueNonRequired).should("not.exist"); // new behavior
    // TODO: test the button

    cy.log("default value, non-required - value different than default");
    filter(defaultValueNonRequired).click();
    popover().findByText("Month").click();
    // clearButton(defaultValueNonRequired).should("not.exist"); // new behavior
    // resetButton(defaultValueNonRequired).should("be.visible"); // new behavior
    chevronIcon(defaultValueNonRequired).should("not.exist");
    // TODO: test the button

    const defaultValueRequired = "default value, required";

    cy.log("default value, required - value same as default");
    clearButton(defaultValueRequired).should("not.exist");
    resetButton(defaultValueRequired).should("not.exist");
    chevronIcon(defaultValueRequired).should("not.exist");

    cy.log("default value, required - value different than default");
    filter(defaultValueRequired).click();
    popover().findByText("Month").click();
    clearButton(defaultValueRequired).should("not.exist");
    resetButton(defaultValueRequired).should("be.visible");
    chevronIcon(defaultValueRequired).should("not.exist");
    filter(defaultValueRequired).should("have.text", "Month");
    resetButton(defaultValueRequired).click();
    filter(defaultValueRequired).should("have.text", "Year");
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
    const parameterIds = ["fed1b910", "75d67d30", "60f12ac2"];

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
            parameter_mappings: parameterIds.map(parameterId => ({
              parameter_id: parameterId,
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
