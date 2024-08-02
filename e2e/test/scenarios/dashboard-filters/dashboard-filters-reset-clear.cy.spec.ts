import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createDashboardWithTabs,
  createQuestionAndDashboard,
  dashboardParameterSidebar,
  editDashboard,
  popover,
  restore,
  updateDashboardCards,
  visitDashboard,
  type DashboardDetails,
  type StructuredQuestionDetails,
} from "e2e/support/helpers";
import { checkNotNull } from "metabase/lib/types";
import type { LocalFieldReference } from "metabase-types/api";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS } = SAMPLE_DATABASE;

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

const PRODUCTS_CATEGORY_FIELD: LocalFieldReference = [
  "field",
  PRODUCTS.CATEGORY,
  {
    "base-type": "type/Text",
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

const ORDERS_QUESTION: StructuredQuestionDetails = {
  query: {
    "source-table": ORDERS_ID,
    limit: 1,
  },
};

const PARAMETER_A = {
  name: "Parameter A",
  slug: "parameter-a",
  id: "fed1b910",
  type: "date/single",
  sectionId: "date",
};

const PARAMETER_B = {
  name: "Parameter B",
  slug: "parameter-b",
  id: "fed1b911",
  type: "date/single",
  sectionId: "date",
};

const TAB_A = { id: 1, name: "Tab A" };

const TAB_B = { id: 2, name: "Tab B" };

const NO_DEFAULT_NON_REQUIRED = "no default value, non-required";

const DEFAULT_NON_REQUIRED = "default value, non-required";

const DEFAULT_REQUIRED = "default value, required";

describe("scenarios > dashboard > filters > reset & clear", () => {
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
          name: NO_DEFAULT_NON_REQUIRED,
          slug: "no-default-value/non-required",
          id: "fed1b910",
          type: "temporal-unit",
          sectionId: "temporal-unit",
        },
        {
          name: DEFAULT_NON_REQUIRED,
          slug: "default-value/non-required",
          id: "75d67d30",
          type: "temporal-unit",
          sectionId: "temporal-unit",
          default: "year",
        },
        {
          name: DEFAULT_REQUIRED,
          slug: "default-value/required",
          id: "60f12ac0",
          type: "temporal-unit",
          sectionId: "temporal-unit",
          default: "year",
          required: true,
        },
      ],
    );

    checkDashboardParameters({
      defaultValueFormatted: "Year",
      otherValue: "Month",
      otherValueFormatted: "Month",
      setValue: (label, value) => {
        filter(label).click();
        popover().findByText(value).click();
      },
    });
  });

  it("time parameters", () => {
    createDashboardWithParameters(
      ORDERS_COUNT_OVER_TIME,
      ORDERS_CREATED_AT_FIELD,
      [
        {
          name: NO_DEFAULT_NON_REQUIRED,
          slug: "no-default-value/non-required",
          id: "fed1b911",
          type: "date/single",
          sectionId: "date",
        },
        {
          name: DEFAULT_NON_REQUIRED,
          slug: "default-value/non-required",
          id: "75d67d31",
          type: "date/single",
          sectionId: "date",
          default: "2024-01-01",
        },
        {
          name: DEFAULT_REQUIRED,
          slug: "default-value/required",
          id: "60f12ac1",
          type: "date/single",
          sectionId: "date",
          default: "2024-01-01",
          required: true,
        },
      ],
    );

    checkDashboardParameters({
      defaultValueFormatted: "January 1, 2024",
      otherValue: "01/01/2020",
      otherValueFormatted: "January 1, 2020",
      setValue: (label, value) => {
        addDateFilter(label, value);
      },
      updateValue: (label, value) => {
        updateDateFilter(label, value);
      },
    });
  });

  it("location parameters - single value", () => {
    createDashboardWithParameters(PEOPLE_QUESTION, PEOPLE_CITY_FIELD, [
      {
        name: NO_DEFAULT_NON_REQUIRED,
        slug: "no-default-value/non-required",
        id: "fed1b912",
        isMultiSelect: false,
        type: "string/=",
        sectionId: "location",
      },
      {
        name: DEFAULT_NON_REQUIRED,
        slug: "default-value/non-required",
        id: "75d67d32",
        isMultiSelect: false,
        type: "string/=",
        sectionId: "location",
        default: ["Bassett"],
      },
      {
        name: DEFAULT_REQUIRED,
        slug: "default-value/required",
        id: "60f12ac2",
        isMultiSelect: false,
        type: "string/=",
        sectionId: "location",
        required: true,
        default: ["Bassett"],
      },
    ]);

    checkDashboardParameters({
      defaultValueFormatted: "Bassett",
      otherValue: "{backspace}Thomson",
      otherValueFormatted: "Thomson",
      setValue: (label, value) => {
        filter(label).click();
        popover().findByRole("searchbox").clear().type(value).blur();
        popover().button("Add filter").click();
      },
      updateValue: (label, value) => {
        filter(label).click();
        popover().findByRole("searchbox").clear().type(value).blur();
        popover().button("Update filter").click();
      },
    });
  });

  it("location parameters - multiple values", () => {
    createDashboardWithParameters(PEOPLE_QUESTION, PEOPLE_CITY_FIELD, [
      {
        name: NO_DEFAULT_NON_REQUIRED,
        slug: "no-default-value/non-required",
        id: "fed1b913",
        type: "string/=",
        sectionId: "location",
      },
      {
        name: DEFAULT_NON_REQUIRED,
        slug: "default-value/non-required",
        id: "75d67d33",
        type: "string/=",
        sectionId: "location",
        default: ["Bassett", "Thomson"],
      },
      {
        name: DEFAULT_REQUIRED,
        slug: "default-value/required",
        id: "60f12ac3",
        type: "string/=",
        sectionId: "location",
        required: true,
        default: ["Bassett", "Thomson"],
      },
    ]);

    checkDashboardParameters({
      defaultValueFormatted: "2 selections",
      otherValue: "{backspace}{backspace}Washington,",
      otherValueFormatted: "Washington",
      setValue: (label, value) => {
        filter(label).click();
        popover().findByRole("searchbox").focus().type(value).blur();
        popover().button("Add filter").click();
      },
      updateValue: (label, value) => {
        filter(label).click();
        popover().findByRole("searchbox").clear().type(value).blur();
        popover().button("Update filter").click();
      },
    });
  });

  it("id parameters - single value", () => {
    createDashboardWithParameters(PEOPLE_QUESTION, PEOPLE_ID_FIELD, [
      {
        name: NO_DEFAULT_NON_REQUIRED,
        slug: "no-default-value/non-required",
        id: "fed1b914",
        isMultiSelect: false,
        type: "id",
        sectionId: "id",
      },
      {
        name: DEFAULT_NON_REQUIRED,
        slug: "default-value/non-required",
        id: "75d67d34",
        isMultiSelect: false,
        type: "id",
        sectionId: "id",
        default: ["1"],
      },
      {
        name: DEFAULT_REQUIRED,
        slug: "default-value/required",
        id: "60f12ac4",
        isMultiSelect: false,
        type: "id",
        sectionId: "id",
        required: true,
        default: ["1"],
      },
    ]);

    checkDashboardParameters({
      defaultValueFormatted: "1",
      otherValue: "{backspace}2",
      otherValueFormatted: "2",
      setValue: (label, value) => {
        filter(label).click();
        popover().findByRole("searchbox").focus().type(value).blur();
        popover().button("Add filter").click();
      },
      updateValue: (label, value) => {
        filter(label).click();
        popover().findByRole("searchbox").clear().type(value).blur();
        popover().button("Update filter").click();
      },
    });
  });

  it("id parameters - multiple values", () => {
    createDashboardWithParameters(PEOPLE_QUESTION, PEOPLE_ID_FIELD, [
      {
        name: NO_DEFAULT_NON_REQUIRED,
        slug: "no-default-value/non-required",
        id: "fed1b915",
        type: "id",
        sectionId: "id",
      },
      {
        name: DEFAULT_NON_REQUIRED,
        slug: "default-value/non-required",
        id: "75d67d35",
        type: "id",
        sectionId: "id",
        default: ["1", "2"],
      },
      {
        name: DEFAULT_REQUIRED,
        slug: "default-value/required",
        id: "60f12ac5",
        type: "id",
        sectionId: "id",
        required: true,
        default: ["1", "2"],
      },
    ]);

    checkDashboardParameters({
      defaultValueFormatted: "2 selections",
      otherValue: "{backspace}{backspace}3",
      otherValueFormatted: "3",
      setValue: (label, value) => {
        filter(label).click();
        popover().findByRole("searchbox").focus().type(value).blur();
        popover().button("Add filter").click();
      },
      updateValue: (label, value) => {
        filter(label).click();
        popover().findByRole("searchbox").clear().type(value).blur();
        popover().button("Update filter").click();
      },
    });
  });

  it("number parameters - single value", () => {
    createDashboardWithParameters(PEOPLE_QUESTION, PEOPLE_ID_FIELD, [
      {
        name: NO_DEFAULT_NON_REQUIRED,
        slug: "no-default-value/non-required",
        id: "fed1b916",
        type: "number/>=",
        sectionId: "number",
      },
      {
        name: DEFAULT_NON_REQUIRED,
        slug: "default-value/non-required",
        id: "75d67d36",
        type: "number/>=",
        sectionId: "number",
        default: [1],
      },
      {
        name: DEFAULT_REQUIRED,
        slug: "default-value/required",
        id: "60f12ac6",
        type: "number/>=",
        sectionId: "number",
        required: true,
        default: [1],
      },
    ]);

    checkDashboardParameters({
      defaultValueFormatted: "1",
      otherValue: "{backspace}2",
      otherValueFormatted: "2",
      setValue: (label, value) => {
        filter(label).click();
        popover().findByRole("textbox").focus().type(value).blur();
        popover().button("Add filter").click();
      },
      updateValue: (label, value) => {
        filter(label).click();
        popover().findByRole("textbox").focus().type(value).blur();
        popover().button("Update filter").click();
      },
    });
  });

  it("number parameters - multiple values", () => {
    createDashboardWithParameters(PEOPLE_QUESTION, PEOPLE_ID_FIELD, [
      {
        name: NO_DEFAULT_NON_REQUIRED,
        slug: "no-default-value/non-required",
        id: "fed1b917",
        type: "number/between",
        sectionId: "number",
      },
      {
        name: DEFAULT_NON_REQUIRED,
        slug: "default-value/non-required",
        id: "75d67d37",
        type: "number/between",
        sectionId: "number",
        default: [1, 2],
      },
      {
        name: DEFAULT_REQUIRED,
        slug: "default-value/required",
        id: "60f12ac7",
        type: "number/between",
        sectionId: "number",
        required: true,
        default: [1, 2],
      },
    ]);

    checkDashboardParameters({
      defaultValueFormatted: "2 selections",
      otherValue: ["3", "4"],
      otherValueFormatted: "2 selections",
      setValue: (label, [firstValue, secondValue]) => {
        addRangeFilter(label, firstValue, secondValue);
      },
      updateValue: (label, [firstValue, secondValue]) => {
        updateRangeFilter(label, firstValue, secondValue);
      },
    });
  });

  it("text parameters - single value", () => {
    createDashboardWithParameters(ORDERS_QUESTION, PRODUCTS_CATEGORY_FIELD, [
      {
        name: NO_DEFAULT_NON_REQUIRED,
        slug: "no-default-value/non-required",
        id: "fed1b918",
        isMultiSelect: false,
        type: "string/=",
        sectionId: "string",
      },
      {
        name: DEFAULT_NON_REQUIRED,
        slug: "default-value/non-required",
        id: "75d67d38",
        isMultiSelect: false,
        type: "string/=",
        sectionId: "string",
        default: ["Gizmo"],
      },
      {
        name: DEFAULT_REQUIRED,
        slug: "default-value/required",
        id: "60f12ac8",
        isMultiSelect: false,
        type: "string/=",
        sectionId: "string",
        required: true,
        default: ["Gizmo"],
      },
    ]);

    checkDashboardParameters({
      defaultValueFormatted: "Gizmo",
      otherValue: "{backspace}Gadget,",
      otherValueFormatted: "Gadget",
      setValue: (label, value) => {
        filter(label).click();
        popover().findByRole("combobox").type(value);
        popover().button("Add filter").click();
      },
      updateValue: (label, value) => {
        filter(label).click();
        popover().findByRole("combobox").type(value);
        popover().button("Update filter").click();
      },
    });
  });

  it("text parameters - multiple values", () => {
    createDashboardWithParameters(ORDERS_QUESTION, PRODUCTS_CATEGORY_FIELD, [
      {
        name: NO_DEFAULT_NON_REQUIRED,
        slug: "no-default-value/non-required",
        id: "fed1b919",
        type: "string/=",
        sectionId: "string",
      },
      {
        name: DEFAULT_NON_REQUIRED,
        slug: "default-value/non-required",
        id: "75d67d39",
        type: "string/=",
        sectionId: "string",
        default: ["Gizmo", "Gadget"],
      },
      {
        name: DEFAULT_REQUIRED,
        slug: "default-value/required",
        id: "60f12ac9",
        type: "string/=",
        sectionId: "string",
        required: true,
        default: ["Gizmo", "Gadget"],
      },
    ]);

    checkDashboardParameters({
      defaultValueFormatted: "2 selections",
      otherValue: "{backspace}{backspace}Doohickey,Widget,",
      otherValueFormatted: "2 selections",
      setValue: (label, value) => {
        filter(label).click();
        popover().findByRole("combobox").type(value);
        popover().button("Add filter").click();
      },
      updateValue: (label, value) => {
        filter(label).click();
        popover().findByRole("combobox").type(value);
        popover().button("Update filter").click();
      },
    });
  });

  it("chevron icons are aligned in temporal unit parameter sidebar", () => {
    createDashboardWithParameters(
      ORDERS_COUNT_OVER_TIME,
      ORDERS_CREATED_AT_FIELD,
      [
        {
          name: "Unit of Time",
          slug: "unit-of-time",
          id: "fed1b910",
          type: "temporal-unit",
          sectionId: "temporal-unit",
        },
      ],
    );
    editDashboard();
    editFilter("Unit of Time");

    dashboardParameterSidebar()
      .findAllByLabelText("chevrondown icon")
      .then(([$firstChevron, ...$otherChevrons]) => {
        const firstRect = $firstChevron.getBoundingClientRect();

        for (const $chevron of $otherChevrons) {
          const rect = $chevron.getBoundingClientRect();

          expect(firstRect.left, "left").to.eq(rect.left);
          expect(firstRect.right, "right").to.eq(rect.right);
        }
      });
  });
});

describe("scenarios > dashboard > filters > reset all filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("works across all tabs with 'auto-apply filters' on", () => {
    createDashboardWithTabsAndParameters({ auto_apply_filters: true });
    checkResetAllFiltersWorksAcrossTabs();
  });

  it("works across all tabs with 'auto-apply filters' off", () => {
    createDashboardWithTabsAndParameters({ auto_apply_filters: false });
    checkResetAllFiltersWorksAcrossTabs();
  });
});

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

function createDashboardWithTabsAndParameters(
  dashboardDetails: DashboardDetails,
) {
  createDashboardWithTabs({
    tabs: [TAB_A, TAB_B],
    parameters: [PARAMETER_A, PARAMETER_B],
    dashcards: [
      {
        id: -1,
        dashboard_tab_id: TAB_A.id,
        size_x: 10,
        size_y: 4,
        row: 0,
        col: 0,
        card_id: ORDERS_QUESTION_ID,
        parameter_mappings: [
          {
            parameter_id: PARAMETER_A.id,
            card_id: ORDERS_QUESTION_ID,
            target: ["dimension", ORDERS_CREATED_AT_FIELD],
          },
        ],
      },
      {
        id: -2,
        dashboard_tab_id: TAB_B.id,
        size_x: 10,
        size_y: 4,
        row: 0,
        col: 0,
        card_id: ORDERS_COUNT_QUESTION_ID,
        parameter_mappings: [
          {
            parameter_id: PARAMETER_B.id,
            card_id: ORDERS_COUNT_QUESTION_ID,
            target: ["dimension", ORDERS_CREATED_AT_FIELD],
          },
        ],
      },
    ],
    ...dashboardDetails,
  }).then(dashboard => visitDashboard(dashboard.id));
}

function checkStatusIcon(
  label: string,
  /**
   * Use 'none' when no icon should be visible.
   */
  icon: "chevron" | "reset" | "clear" | "none",
) {
  clearIcon(label).should(icon === "clear" ? "be.visible" : "not.exist");
  resetIcon(label).should(icon === "reset" ? "be.visible" : "not.exist");
  chevronIcon(label).should(icon === "chevron" ? "be.visible" : "not.exist");
}

function checkDashboardParameters<T = string>({
  defaultValueFormatted,
  otherValue,
  otherValueFormatted,
  setValue,
  updateValue = setValue,
}: {
  defaultValueFormatted: string;
  otherValue: T;
  otherValueFormatted: string;
  setValue: (label: string, value: T) => void;
  updateValue?: (label: string, value: T) => void;
}) {
  cy.log("no default value, non-required, no current value");
  checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "chevron");
  checkResetAllFiltersHidden();

  cy.log("no default value, non-required, has current value");
  setValue(NO_DEFAULT_NON_REQUIRED, otherValue);
  filter(NO_DEFAULT_NON_REQUIRED).should("have.text", otherValueFormatted);
  checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "clear");
  checkResetAllFiltersShown();

  clearButton(NO_DEFAULT_NON_REQUIRED).click();
  filter(NO_DEFAULT_NON_REQUIRED).should("have.text", NO_DEFAULT_NON_REQUIRED);
  checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "chevron");
  checkResetAllFiltersHidden();

  cy.log("has default value, non-required, current value same as default");
  checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");
  checkResetAllFiltersHidden();
  filter(DEFAULT_NON_REQUIRED).should("have.text", defaultValueFormatted);

  clearButton(DEFAULT_NON_REQUIRED).click();
  filter(DEFAULT_NON_REQUIRED).should("have.text", DEFAULT_NON_REQUIRED);
  checkResetAllFiltersShown();

  cy.log("has default value, non-required, no current value");
  checkStatusIcon(DEFAULT_NON_REQUIRED, "reset");
  checkResetAllFiltersShown();

  resetButton(DEFAULT_NON_REQUIRED).click();
  filter(DEFAULT_NON_REQUIRED).should("have.text", defaultValueFormatted);
  checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");
  checkResetAllFiltersHidden();

  cy.log(
    "has default value, non-required, current value different than default",
  );
  updateValue(DEFAULT_NON_REQUIRED, otherValue);
  filter(DEFAULT_NON_REQUIRED).should("have.text", otherValueFormatted);
  checkStatusIcon(DEFAULT_NON_REQUIRED, "reset");
  checkResetAllFiltersShown();

  resetButton(DEFAULT_NON_REQUIRED).click();
  filter(DEFAULT_NON_REQUIRED).should("have.text", defaultValueFormatted);
  checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");
  checkResetAllFiltersHidden();

  cy.log("has default value, required, value same as default");
  checkStatusIcon(DEFAULT_REQUIRED, "none");
  checkResetAllFiltersHidden();

  cy.log("has default value, required, current value different than default");
  updateValue(DEFAULT_REQUIRED, otherValue);
  filter(DEFAULT_REQUIRED).should("have.text", otherValueFormatted);
  checkStatusIcon(DEFAULT_REQUIRED, "reset");
  checkResetAllFiltersShown();

  resetButton(DEFAULT_REQUIRED).click();
  filter(DEFAULT_REQUIRED).should("have.text", defaultValueFormatted);
  checkStatusIcon(DEFAULT_REQUIRED, "none");
  checkResetAllFiltersHidden();

  checkParameterSidebarDefaultValue({
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue,
  });
}

function checkParameterSidebarDefaultValue<T = string>({
  defaultValueFormatted,
  otherValue,
  otherValueFormatted,
  setValue,
  updateValue,
}: {
  defaultValueFormatted: string;
  otherValue: T;
  otherValueFormatted: string;
  setValue: (label: string, value: T) => void;
  updateValue: (label: string, value: T) => void;
}) {
  cy.log("parameter sidebar");
  editDashboard();

  cy.log(NO_DEFAULT_NON_REQUIRED);
  editFilter(NO_DEFAULT_NON_REQUIRED);
  dashboardParameterSidebar().within(() => {
    filter("Default value").scrollIntoView();
    filter("Default value").should("have.text", "No default");
    checkStatusIcon("Default value", "chevron");
  });

  setValue("Default value", otherValue);

  dashboardParameterSidebar().within(() => {
    filter("Default value").should("have.text", otherValueFormatted);
    checkStatusIcon("Default value", "clear");

    clearButton("Default value").click();
    filter("Default value").should("have.text", "No default");
    checkStatusIcon("Default value", "chevron");
  });

  cy.log(DEFAULT_NON_REQUIRED);
  editFilter(DEFAULT_NON_REQUIRED);
  dashboardParameterSidebar().within(() => {
    filter("Default value").should("have.text", defaultValueFormatted);
    checkStatusIcon("Default value", "clear");

    clearButton("Default value").click();
    filter("Default value").should("have.text", "No default");
    checkStatusIcon("Default value", "chevron");
  });

  setValue("Default value", otherValue);

  dashboardParameterSidebar().within(() => {
    filter("Default value").should("have.text", otherValueFormatted);
    checkStatusIcon("Default value", "clear");
  });

  cy.log(DEFAULT_REQUIRED);
  editFilter(DEFAULT_REQUIRED);
  dashboardParameterSidebar().within(() => {
    filter("Default value").should("have.text", defaultValueFormatted);
    checkStatusIcon("Default value", "clear");

    clearButton("Default value").click();
    filter("Default value (required)").should("have.text", "No default");
    checkStatusIcon("Default value (required)", "chevron");
  });

  updateValue("Default value (required)", otherValue);

  dashboardParameterSidebar().within(() => {
    filter("Default value").should("have.text", otherValueFormatted);
    checkStatusIcon("Default value", "clear");
  });
}

function checkResetAllFiltersWorksAcrossTabs() {
  checkResetAllFiltersHidden();
  filter(PARAMETER_A.name).should("have.text", PARAMETER_A.name);

  addDateFilter(PARAMETER_A.name, "01/01/2024");
  filter(PARAMETER_A.name).should("have.text", "January 1, 2024");
  checkResetAllFiltersShown();

  cy.findAllByTestId("tab-button-input-wrapper").eq(1).click();
  checkResetAllFiltersShown();

  cy.button("Move, trash, and more…").click();
  popover().findByText("Reset all filters").click();

  checkResetAllFiltersHidden();

  cy.findAllByTestId("tab-button-input-wrapper").eq(0).click();
  checkResetAllFiltersHidden();
  filter(PARAMETER_A.name).should("have.text", PARAMETER_A.name);
}

function checkResetAllFiltersShown() {
  cy.button("Move, trash, and more…").click();
  popover().findByText("Reset all filters").should("be.visible");
  cy.button("Move, trash, and more…").click();
}

function checkResetAllFiltersHidden() {
  cy.button("Move, trash, and more…").click();
  popover().findByText("Reset all filters").should("not.exist");
  cy.button("Move, trash, and more…").click();
}

function filter(label: string) {
  return cy.findByLabelText(label);
}

function editFilter(label: string) {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(label)
    .click();
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

function addDateFilter(label: string, value: string) {
  filter(label).click();
  popover().findByRole("textbox").clear().type(value).blur();
  popover().button("Add filter").click();
}

function updateDateFilter(label: string, value: string) {
  filter(label).click();
  popover().findByRole("textbox").clear().type(value).blur();
  popover().button("Update filter").click();
}

function addRangeFilter(
  label: string,
  firstValue: string,
  secondValue: string,
) {
  filter(label).click();
  popover().findAllByRole("textbox").first().clear().type(firstValue).blur();
  popover().findAllByRole("textbox").last().clear().type(secondValue).blur();
  popover().button("Add filter").click();
}

function updateRangeFilter(
  label: string,
  firstValue: string,
  secondValue: string,
) {
  filter(label).click();
  popover().findAllByRole("textbox").first().clear().type(firstValue).blur();
  popover().findAllByRole("textbox").last().clear().type(secondValue).blur();
  popover().button("Update filter").click();
}
