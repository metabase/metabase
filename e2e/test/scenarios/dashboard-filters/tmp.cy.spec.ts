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

const ORDERS_CREATED_AT_FIELD: LocalFieldReference = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

const PEOPLE_ID_FIELD: LocalFieldReference = [
  "field",
  PEOPLE.ID,
  {
    "base-type": "type/BigInteger",
  },
];

const PEOPLE_CITY_FIELD: LocalFieldReference = [
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
    breakout: [ORDERS_CREATED_AT_FIELD],
  },
};

const PEOPLE_QUESTION: StructuredQuestionDetails = {
  query: {
    "source-table": PEOPLE_ID,
    limit: 1,
  },
};

describe("scenarios > dashboard > filters > clear & reset buttons", () => {
  // TODO: test chevron icon alignment in parameter sidebar
  // TODO: current value empty assertions

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("temporal unit parameters", () => {
    createDashboardWithParameters(
      ORDERS_COUNT_OVER_TIME,
      ORDERS_CREATED_AT_FIELD,
      [
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
      ],
    );

    const noDefaultNonRequired = "no default value, non-required";

    cy.log("no default value, non-required, no current value");
    checkButtonVisible(noDefaultNonRequired, "chevron");

    cy.log("no default value, non-required, has current value");
    filter(noDefaultNonRequired).click();
    popover().findByText("Month").click();
    filter(noDefaultNonRequired).should("have.text", "Month");
    checkButtonVisible(noDefaultNonRequired, "clear");
    clearButton(noDefaultNonRequired).click();
    filter(noDefaultNonRequired).should("have.text", noDefaultNonRequired);
    checkButtonVisible(noDefaultNonRequired, "chevron");

    const defaultNonRequired = "default value, non-required";

    cy.log("has default value, non-required, value same as default");
    checkButtonVisible(defaultNonRequired, "clear");
    filter(defaultNonRequired).should("have.text", "Year");
    clearButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", defaultNonRequired);

    cy.log("has default value, non-required, no current value");
    checkButtonVisible(defaultNonRequired, "reset");
    resetButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", "Year");
    checkButtonVisible(defaultNonRequired, "clear");

    cy.log(
      "has default value, non-required, current value different than default",
    );
    filter(defaultNonRequired).click();
    popover().findByText("Month").click();
    filter(defaultNonRequired).should("have.text", "Month");
    checkButtonVisible(defaultNonRequired, "reset");
    resetButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", "Year");
    checkButtonVisible(defaultNonRequired, "clear");

    const defaultRequired = "default value, required";

    cy.log("has default value, required, value same as default");
    checkButtonVisible(defaultRequired, "none");

    cy.log("has default value, required, current value different than default");
    filter(defaultRequired).click();
    popover().findByText("Month").click();
    filter(defaultRequired).should("have.text", "Month");
    checkButtonVisible(defaultRequired, "reset");
    resetButton(defaultRequired).click();
    filter(defaultRequired).should("have.text", "Year");
    checkButtonVisible(defaultRequired, "none");
  });

  it("time parameters", () => {
    createDashboardWithParameters(
      ORDERS_COUNT_OVER_TIME,
      ORDERS_CREATED_AT_FIELD,
      [
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
      ],
    );

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
    checkButtonVisible(noDefaultNonRequired, "chevron");

    const defaultNonRequired = "default value, non-required";

    cy.log("has default value, non-required, value same as default");
    checkButtonVisible(defaultNonRequired, "clear");
    filter(defaultNonRequired).should("have.text", "January 1, 2024");
    clearButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", defaultNonRequired);

    cy.log("has default value, non-required, no current value");
    checkButtonVisible(defaultNonRequired, "reset");
    resetButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", "January 1, 2024");
    checkButtonVisible(defaultNonRequired, "clear");

    cy.log(
      "has default value, non-required, current value different than default",
    );
    filter(defaultNonRequired).click();
    popover().findByRole("textbox").clear().type("01/01/2020").blur();
    popover().button("Update filter").click();
    filter(defaultNonRequired).should("have.text", "January 1, 2020");
    checkButtonVisible(defaultNonRequired, "reset");
    resetButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", "January 1, 2024");
    checkButtonVisible(defaultNonRequired, "clear");

    const defaultRequired = "default value, required";

    cy.log("has default value, required, value same as default");
    checkButtonVisible(defaultRequired, "none");

    cy.log("has default value, required, current value different than default");
    filter(defaultRequired).click();
    popover().findByRole("textbox").clear().type("01/01/2020").blur();
    popover().button("Update filter").click();
    filter(defaultRequired).should("have.text", "January 1, 2020");
    checkButtonVisible(defaultRequired, "reset");
    resetButton(defaultRequired).click();
    filter(defaultRequired).should("have.text", "January 1, 2024");
    checkButtonVisible(defaultRequired, "none");
  });

  it("location parameters - single value", () => {
    createDashboardWithParameters(PEOPLE_QUESTION, PEOPLE_CITY_FIELD, [
      {
        name: "no default value, non-required",
        slug: "no-default-value/non-required",
        id: "fed1b910",
        isMultiSelect: false,
        type: "string/=",
        sectionId: "location",
      },
      {
        name: "default value, non-required",
        slug: "default-value/non-required",
        id: "75d67d30",
        isMultiSelect: false,
        type: "string/=",
        sectionId: "location",
        default: ["Bassett"],
      },
      {
        name: "default value, required",
        slug: "default-value/required",
        id: "60f12ac2",
        isMultiSelect: false,
        type: "string/=",
        sectionId: "location",
        required: true,
        default: ["Bassett"],
      },
    ]);

    const noDefaultNonRequired = "no default value, non-required";

    cy.log("no default value, non-required, no current value");
    checkButtonVisible(noDefaultNonRequired, "chevron");

    cy.log("no default value, non-required, has current value");
    filter(noDefaultNonRequired).click();
    popover().findByRole("searchbox").clear().type("Bassett").blur();
    popover().button("Add filter").click();
    checkButtonVisible(noDefaultNonRequired, "clear");
    filter(noDefaultNonRequired).should("have.text", "Bassett");
    clearButton(noDefaultNonRequired).click();
    filter(noDefaultNonRequired).should("have.text", noDefaultNonRequired);
    checkButtonVisible(noDefaultNonRequired, "chevron");

    const defaultNonRequired = "default value, non-required";

    cy.log("has default value, non-required, value same as default");
    checkButtonVisible(defaultNonRequired, "clear");
    filter(defaultNonRequired).should("have.text", "Bassett");
    clearButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", defaultNonRequired);

    cy.log("has default value, non-required, no current value");
    checkButtonVisible(defaultNonRequired, "reset");
    resetButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", "Bassett");
    checkButtonVisible(defaultNonRequired, "clear");

    cy.log(
      "has default value, non-required, current value different than default",
    );
    filter(defaultNonRequired).click();
    popover().findByRole("searchbox").focus().type("{backspace}Thomson").blur();
    popover().button("Update filter").click();
    filter(defaultNonRequired).should("have.text", "Thomson");
    checkButtonVisible(defaultNonRequired, "reset");
    resetButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", "Bassett");
    checkButtonVisible(defaultNonRequired, "clear");

    const defaultRequired = "default value, required";

    cy.log("has default value, required, value same as default");
    checkButtonVisible(defaultRequired, "none");

    cy.log("has default value, required, current value different than default");
    filter(defaultRequired).click();
    popover().findByRole("searchbox").focus().type("{backspace}Thomson").blur();
    popover().button("Update filter").click();
    filter(defaultRequired).should("have.text", "Thomson");
    checkButtonVisible(defaultRequired, "reset");
    resetButton(defaultRequired).click();
    filter(defaultRequired).should("have.text", "Bassett");
    checkButtonVisible(defaultRequired, "none");
  });

  it("location parameters - multiple values", () => {
    createDashboardWithParameters(PEOPLE_QUESTION, PEOPLE_CITY_FIELD, [
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
    checkButtonVisible(noDefaultNonRequired, "chevron");

    const defaultNonRequired = "default value, non-required";

    cy.log("has default value, non-required, value same as default");
    checkButtonVisible(defaultNonRequired, "clear");
    filter(defaultNonRequired).should("have.text", "2 selections");
    clearButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", defaultNonRequired);

    cy.log("has default value, non-required, no current value");
    checkButtonVisible(defaultNonRequired, "reset");
    resetButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", "2 selections");
    checkButtonVisible(defaultNonRequired, "clear");

    cy.log(
      "has default value, non-required, current value different than default",
    );
    filter(defaultNonRequired).click();
    popover().findByRole("searchbox").focus().type("Washington").blur();
    popover().button("Update filter").click();
    filter(defaultNonRequired).should("have.text", "3 selections");
    checkButtonVisible(defaultNonRequired, "reset");
    resetButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", "2 selections");
    checkButtonVisible(defaultNonRequired, "clear");

    const defaultRequired = "default value, required";

    cy.log("has default value, required, value same as default");
    checkButtonVisible(defaultRequired, "none");

    cy.log("has default value, required, current value different than default");
    filter(defaultRequired).click();
    popover().findByRole("searchbox").focus().type("Washington").blur();
    popover().button("Update filter").click();
    filter(defaultRequired).should("have.text", "3 selections");
    checkButtonVisible(defaultRequired, "reset");
    resetButton(defaultRequired).click();
    filter(defaultRequired).should("have.text", "2 selections");
    checkButtonVisible(defaultRequired, "none");
  });

  it("id parameters - single value", () => {
    createDashboardWithParameters(PEOPLE_QUESTION, PEOPLE_ID_FIELD, [
      {
        name: "no default value, non-required",
        slug: "no-default-value/non-required",
        id: "fed1b910",
        isMultiSelect: false,
        type: "id",
        sectionId: "id",
      },
      {
        name: "default value, non-required",
        slug: "default-value/non-required",
        id: "75d67d30",
        isMultiSelect: false,
        type: "id",
        sectionId: "id",
        default: ["1"],
      },
      {
        name: "default value, required",
        slug: "default-value/required",
        id: "60f12ac2",
        isMultiSelect: false,
        type: "id",
        sectionId: "id",
        required: true,
        default: ["1"],
      },
    ]);

    const noDefaultNonRequired = "no default value, non-required";

    cy.log("no default value, non-required, no current value");
    checkButtonVisible(noDefaultNonRequired, "chevron");

    cy.log("no default value, non-required, has current value");
    filter(noDefaultNonRequired).click();
    popover().findByRole("searchbox").clear().type("1").blur();
    popover().button("Add filter").click();
    checkButtonVisible(noDefaultNonRequired, "clear");
    filter(noDefaultNonRequired).should("have.text", "1");
    clearButton(noDefaultNonRequired).click();
    filter(noDefaultNonRequired).should("have.text", noDefaultNonRequired);
    checkButtonVisible(noDefaultNonRequired, "chevron");

    const defaultNonRequired = "default value, non-required";

    cy.log("has default value, non-required, value same as default");
    checkButtonVisible(defaultNonRequired, "clear");
    filter(defaultNonRequired).should("have.text", "1");
    clearButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", defaultNonRequired);

    cy.log("has default value, non-required, no current value");
    checkButtonVisible(defaultNonRequired, "reset");
    resetButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", "1");
    checkButtonVisible(defaultNonRequired, "clear");

    cy.log(
      "has default value, non-required, current value different than default",
    );
    filter(defaultNonRequired).click();
    popover().findByRole("searchbox").focus().type("{backspace}2").blur();
    popover().button("Update filter").click();
    filter(defaultNonRequired).should("have.text", "2");
    checkButtonVisible(defaultNonRequired, "reset");
    resetButton(defaultNonRequired).click();
    filter(defaultNonRequired).should("have.text", "1");
    checkButtonVisible(defaultNonRequired, "clear");

    const defaultRequired = "default value, required";

    cy.log("has default value, required, value same as default");
    checkButtonVisible(defaultRequired, "none");

    cy.log("has default value, required, current value different than default");
    filter(defaultRequired).click();
    popover().findByRole("searchbox").focus().type("{backspace}2").blur();
    popover().button("Update filter").click();
    filter(defaultRequired).should("have.text", "2");
    checkButtonVisible(defaultRequired, "reset");
    resetButton(defaultRequired).click();
    filter(defaultRequired).should("have.text", "1");
    checkButtonVisible(defaultRequired, "none");
  });

  function filter(label: string) {
    return cy.findByLabelText(label);
  }

  function clearIcon(label: string) {
    return filter(label).icon("close");
  }

  function resetIcon(label: string) {
    return filter(label).icon("revert");
  }

  function clearButton(label: string) {
    return filter(label).findByLabelText("Clear");
  }

  function resetButton(label: string) {
    return filter(label).findByLabelText("Reset filter to default state");
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
    clearIcon(label).should(button === "clear" ? "be.visible" : "not.exist");

    resetIcon(label).should(button === "reset" ? "be.visible" : "not.exist");

    chevronIcon(label).should(
      button === "chevron" ? "be.visible" : "not.exist",
    );
  }
});
