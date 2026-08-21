/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-reset-clear.cy.spec.ts
 *
 * The flow functions (createDashboardWithParameters, checkDashboardParameters,
 * checkParameterSidebarDefaultValue, the cross-tab reset checks and the
 * status-icon lookups) live in support/dashboard-filters-reset-clear.ts. Each
 * test builds a dashboard for one parameter type and passes type-specific
 * set/update callbacks — the Cypress `(label, value)` callbacks become
 * `(page, label, value)` here.
 *
 * Cypress key sequences the callbacks typed into inputs ({backspace},
 * {selectAll}) are replayed by the helper's typeCypress (real keystrokes so
 * token-field / autocomplete widgets react as they would to a user).
 */
import { editDashboard, filterWidget } from "../support/dashboard";
import { dashboardParameterSidebar } from "../support/dashboard-parameters";
import { dashboardParametersPopover } from "../support/dashboard-core";
import {
  DEFAULT_NON_REQUIRED,
  DEFAULT_REQUIRED,
  NO_DEFAULT_NON_REQUIRED,
  addDateFilter,
  addRangeFilter,
  checkDashboardParameters,
  checkResetAllFiltersToDefaultWorksAcrossTabs,
  checkResetAllFiltersWorksAcrossTabs,
  createDashboardWithParameterInEachTab,
  createDashboardWithParameters,
  editFilter,
  fieldValuesTextbox,
  filter,
  listItemContaining,
  typeCypress,
  updateDateFilter,
  updateRangeFilter,
} from "../support/dashboard-filters-reset-clear";
import { test, expect } from "../support/fixtures";
import { fieldValuesCombobox } from "../support/native-filters";
import { ORDERS_COUNT_QUESTION_ID } from "../support/organization";
import { ORDERS_QUESTION_ID, SAMPLE_DATABASE } from "../support/sample-data";
import { icon, popover } from "../support/ui";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS } = SAMPLE_DATABASE;

const ORDERS_CREATED_AT_FIELD = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime", "temporal-unit": "month" },
];

const PEOPLE_ID_FIELD = [
  "field",
  PEOPLE.ID,
  { "base-type": "type/BigInteger" },
];

const PRODUCTS_CATEGORY_FIELD = [
  "field",
  PRODUCTS.CATEGORY,
  { "base-type": "type/Text" },
];

const PEOPLE_CITY_FIELD = ["field", PEOPLE.CITY, { "base-type": "type/Text" }];

const ORDERS_COUNT_OVER_TIME = {
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [ORDERS_CREATED_AT_FIELD],
  },
};

const PEOPLE_QUESTION = {
  query: {
    "source-table": PEOPLE_ID,
    limit: 1,
  },
};

const ORDERS_QUESTION = {
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

const PARAMETER_A_DEFAULT_VALUE = { ...PARAMETER_A, default: "2026-01-05" };

const PARAMETER_B_DEFAULT_VALUE = { ...PARAMETER_B, default: "2026-01-05" };

const TAB_A = { id: 1, name: "Tab A" };

const TAB_B = { id: 2, name: "Tab B" };

test.describe("scenarios > dashboard > filters > reset & clear", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("temporal unit parameters", async ({ page, mb }) => {
    await createDashboardWithParameters(
      mb,
      page,
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

    await checkDashboardParameters(page, {
      defaultValueFormatted: "Year",
      otherValue: "Month",
      otherValueFormatted: "Month",
      setValue: async (page, label, value) => {
        await filter(page, label).click();
        await popover(page).getByText(value, { exact: true }).click();
      },
    });
  });

  test("time parameters", async ({ page, mb }) => {
    await createDashboardWithParameters(
      mb,
      page,
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
          default: "2027-01-01",
        },
        {
          name: DEFAULT_REQUIRED,
          slug: "default-value/required",
          id: "60f12ac1",
          type: "date/single",
          sectionId: "date",
          default: "2027-01-01",
          required: true,
        },
      ],
    );

    await checkDashboardParameters(page, {
      defaultValueFormatted: "January 1, 2027",
      otherValue: "01/01/2020",
      otherValueFormatted: "January 1, 2020",
      setValue: (page, label, value) => addDateFilter(page, label, value),
      updateValue: (page, label, value) => updateDateFilter(page, label, value),
    });
  });

  test("location parameters - single value", async ({ page, mb }) => {
    await createDashboardWithParameters(mb, page, PEOPLE_QUESTION, PEOPLE_CITY_FIELD, [
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

    await checkDashboardParameters(page, {
      defaultValueFormatted: "Bassett",
      otherValue: "{backspace}Dike",
      otherValueFormatted: "Dike",
      setValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(fieldValuesTextbox(pop), value);
        await fieldValuesTextbox(pop).blur();
        await pop.getByRole("button", { name: "Add filter" }).click();
      },
      updateValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(fieldValuesTextbox(pop), `{selectAll}{backspace}${value}`);
        await fieldValuesTextbox(pop).blur();
        await pop.getByRole("button", { name: "Update filter" }).click();
      },
      setDefaultValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(pop.getByPlaceholder("Search the list"), value);
        // select filtered value (Cypress's singular findByRole retries until
        // the debounced search has narrowed the list to the one match)
        await expect(pop.getByRole("listitem")).toHaveCount(1);
        await pop.getByRole("listitem").click();
        await pop.getByRole("button", { name: "Add filter" }).click();
      },
      updateDefaultValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(pop.getByPlaceholder("Search the list"), value);
        await expect(pop.getByRole("listitem")).toHaveCount(1);
        await pop.getByRole("listitem").click();
        await pop.getByRole("button", { name: "Update filter" }).click();
      },
    });
  });

  test("location parameters - multiple values", async ({ page, mb }) => {
    await createDashboardWithParameters(mb, page, PEOPLE_QUESTION, PEOPLE_CITY_FIELD, [
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

    await checkDashboardParameters(page, {
      defaultValueFormatted: "2 selections",
      otherValue: "{backspace}{backspace}Dike",
      otherValueFormatted: "Dike",
      setValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(fieldValuesCombobox(pop), value);
        await fieldValuesCombobox(pop).blur();
        await pop.getByRole("button", { name: "Add filter" }).click();
      },
      updateValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(fieldValuesCombobox(pop), value);
        await fieldValuesCombobox(pop).blur();
        await pop.getByRole("button", { name: "Update filter" }).click();
      },
      // we use setDefaultValue here as e2e tests setup shows options
      // differently than in UI and with a local sample database. Maybe it's a
      // sign of a bug in setup
      setDefaultValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(pop.getByPlaceholder("Search the list"), value);
        // select filtered value
        await expect(pop.getByRole("checkbox")).toHaveCount(2);
        await pop.getByRole("checkbox").nth(1).click();
        await pop.getByRole("button", { name: "Add filter" }).click();
      },
      updateDefaultValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(pop.getByPlaceholder("Search the list"), value);
        // select filtered value
        await expect(pop.getByRole("checkbox")).toHaveCount(2);
        await pop.getByRole("checkbox").nth(1).click();
        await pop.getByRole("button", { name: "Update filter" }).click();
      },
    });
  });

  test("id parameters - single value", async ({ page, mb }) => {
    await createDashboardWithParameters(mb, page, PEOPLE_QUESTION, PEOPLE_ID_FIELD, [
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

    await checkDashboardParameters(page, {
      defaultValueFormatted: "Hudson Borer - 1",
      otherValue: "{backspace}2",
      otherValueFormatted: "Domenica Williamson - 2",
      setValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(fieldValuesTextbox(pop), value);
        await fieldValuesTextbox(pop).blur();
        await pop.getByRole("button", { name: "Add filter" }).click();
      },
      updateValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(fieldValuesTextbox(pop), value);
        await fieldValuesTextbox(pop).blur();
        await pop.getByRole("button", { name: "Update filter" }).click();
      },
    });
  });

  test("id parameters - multiple values", async ({ page, mb }) => {
    await createDashboardWithParameters(mb, page, PEOPLE_QUESTION, PEOPLE_ID_FIELD, [
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

    await checkDashboardParameters(page, {
      defaultValueFormatted: "2 selections",
      otherValue: "{backspace}{backspace}3",
      otherValueFormatted: "Lina Heaney - 3",
      setValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(fieldValuesCombobox(pop), value);
        await fieldValuesCombobox(pop).blur();
        await pop.getByRole("button", { name: "Add filter" }).click();
      },
      updateValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = dashboardParametersPopover(page);
        await typeCypress(fieldValuesCombobox(pop), value);
        await fieldValuesCombobox(pop).blur();
        await pop.getByRole("button", { name: "Update filter" }).click();
      },
    });
  });

  test("number parameters - single value", async ({ page, mb }) => {
    await createDashboardWithParameters(mb, page, PEOPLE_QUESTION, PEOPLE_ID_FIELD, [
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

    await checkDashboardParameters(page, {
      defaultValueFormatted: "Hudson Borer - 1",
      otherValue: "{backspace}2",
      otherValueFormatted: "Domenica Williamson - 2",
      setValue: async (page, label, value) => {
        await filter(page, label).click();
        const textbox = popover(page).getByRole("textbox");
        await textbox.focus();
        await typeCypress(textbox, value);
        await textbox.blur();
        await popover(page).getByRole("button", { name: "Add filter" }).click();
      },
      updateValue: async (page, label, value) => {
        await filter(page, label).click();
        const textbox = popover(page).getByRole("textbox");
        await textbox.focus();
        await typeCypress(textbox, value);
        await textbox.blur();
        await popover(page)
          .getByRole("button", { name: "Update filter" })
          .click();
      },
    });
  });

  test("number parameters - multiple values", async ({ page, mb }) => {
    await createDashboardWithParameters(mb, page, PEOPLE_QUESTION, PEOPLE_ID_FIELD, [
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

    await checkDashboardParameters<[string, string]>(page, {
      defaultValueFormatted: "2 selections",
      otherValue: ["3", "4"],
      otherValueFormatted: "2 selections",
      setValue: (page, label, [firstValue, secondValue]) =>
        addRangeFilter(page, label, firstValue, secondValue),
      updateValue: (page, label, [firstValue, secondValue]) =>
        updateRangeFilter(page, label, firstValue, secondValue),
    });
  });

  test("text parameters - single value", async ({ page, mb }) => {
    await createDashboardWithParameters(mb, page, ORDERS_QUESTION, PRODUCTS_CATEGORY_FIELD, [
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

    await checkDashboardParameters(page, {
      defaultValueFormatted: "Gizmo",
      otherValue: "{selectAll}{backspace}Gadget",
      otherValueFormatted: "Gadget",
      setValue: async (page, label, value) => {
        await filter(page, label).click();
        const textbox = popover(page).getByRole("textbox");
        await typeCypress(textbox, value);
        await textbox.blur();
        // Upstream clicks listitem eq(0) after the search filters to the typed
        // category; blur here re-renders the full list before the click lands
        // (eq(0) then = "Doohickey"). Click the matching option directly — the
        // same option eq(0) resolves to once filtered.
        await listItemContaining(
          popover(page),
          value.replace(/\{[^}]+\}/g, ""),
        )
          .first()
          .click();
        await popover(page).getByRole("button", { name: "Add filter" }).click();
      },
      updateValue: async (page, label, value) => {
        await filter(page, label).click();
        const textbox = popover(page).getByRole("textbox");
        await typeCypress(textbox, value);
        await listItemContaining(
          popover(page),
          value.replace(/\{[^}]+\}/g, ""),
        )
          .first()
          .click();
        await popover(page)
          .getByRole("button", { name: "Update filter" })
          .click();
      },
    });
  });

  test("text parameters - multiple values", async ({ page, mb }) => {
    await createDashboardWithParameters(mb, page, ORDERS_QUESTION, PRODUCTS_CATEGORY_FIELD, [
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

    await checkDashboardParameters(page, {
      defaultValueFormatted: "2 selections",
      otherValue: "Doohickey,Widget,",
      otherValueFormatted: "2 selections",
      setValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = popover(page);
        // Each option is a checkbox inside the listitem; clicking the <li>
        // container doesn't toggle it, so target the checkbox by name (the
        // deepest clickable node, like Cypress's .contains().click()).
        for (const item of value.split(",").filter(Boolean)) {
          await pop.getByRole("checkbox", { name: item, exact: true }).click();
        }
        await pop.getByRole("button", { name: "Add filter" }).click();
      },
      updateValue: async (page, label, value) => {
        await filter(page, label).click();
        const pop = popover(page);
        await pop
          .getByRole("checkbox", { name: "Select all", exact: true })
          .click();
        await pop
          .getByRole("checkbox", { name: "Select all", exact: true })
          .click();
        for (const item of value.split(",").filter(Boolean)) {
          await pop.getByRole("checkbox", { name: item, exact: true }).click();
        }
        await pop.getByRole("button", { name: "Update filter" }).click();
      },
    });
  });

  test("chevron icons are aligned in temporal unit parameter sidebar", async ({
    page,
    mb,
  }) => {
    await createDashboardWithParameters(
      mb,
      page,
      ORDERS_COUNT_OVER_TIME,
      ORDERS_CREATED_AT_FIELD,
      [
        {
          name: "Time grouping",
          slug: "unit-of-time",
          id: "fed1b910",
          type: "temporal-unit",
          sectionId: "temporal-unit",
        },
      ],
    );
    await editDashboard(page);
    await editFilter(page, "Time grouping");

    const boxes = await dashboardParameterSidebar(page)
      .getByLabel("chevrondown icon", { exact: true })
      .evaluateAll((els) =>
        els.map((el) => {
          const rect = el.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
      );

    const [first, ...others] = boxes;
    for (const box of others) {
      expect(box.left, "left").toBe(first.left);
      expect(box.right, "right").toBe(first.right);
    }
  });
});

test.describe("scenarios > dashboard > filters > reset all filters", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("resetting to empty value", () => {
    test("works across all tabs with 'auto-apply filters' on", async ({
      page,
      mb,
    }) => {
      await createDashboardWithParameterInEachTab(mb, page, {
        autoApplyFilters: true,
        parameters: [PARAMETER_A, PARAMETER_B],
        ordersQuestionId: ORDERS_QUESTION_ID,
        ordersCountQuestionId: ORDERS_COUNT_QUESTION_ID,
        createdAtField: ORDERS_CREATED_AT_FIELD,
        tabA: TAB_A,
        tabB: TAB_B,
      });
      await checkResetAllFiltersWorksAcrossTabs(page, {
        autoApplyFilters: true,
        parameterAName: PARAMETER_A.name,
        parameterBName: PARAMETER_B.name,
      });
    });

    test("works across all tabs with 'auto-apply filters' off", async ({
      page,
      mb,
    }) => {
      await createDashboardWithParameterInEachTab(mb, page, {
        autoApplyFilters: false,
        parameters: [PARAMETER_A, PARAMETER_B],
        ordersQuestionId: ORDERS_QUESTION_ID,
        ordersCountQuestionId: ORDERS_COUNT_QUESTION_ID,
        createdAtField: ORDERS_CREATED_AT_FIELD,
        tabA: TAB_A,
        tabB: TAB_B,
      });
      await checkResetAllFiltersWorksAcrossTabs(page, {
        autoApplyFilters: false,
        parameterAName: PARAMETER_A.name,
        parameterBName: PARAMETER_B.name,
      });
    });
  });

  test.describe("resetting to default value", () => {
    test("works across all tabs with 'auto-apply filters' on", async ({
      page,
      mb,
    }) => {
      await createDashboardWithParameterInEachTab(mb, page, {
        autoApplyFilters: true,
        parameters: [PARAMETER_A_DEFAULT_VALUE, PARAMETER_B_DEFAULT_VALUE],
        ordersQuestionId: ORDERS_QUESTION_ID,
        ordersCountQuestionId: ORDERS_COUNT_QUESTION_ID,
        createdAtField: ORDERS_CREATED_AT_FIELD,
        tabA: TAB_A,
        tabB: TAB_B,
      });
      await checkResetAllFiltersToDefaultWorksAcrossTabs(page, {
        autoApplyFilters: true,
        parameterAName: PARAMETER_A.name,
        parameterBName: PARAMETER_B.name,
      });
    });

    test("works across all tabs with 'auto-apply filters' off", async ({
      page,
      mb,
    }) => {
      await createDashboardWithParameterInEachTab(mb, page, {
        autoApplyFilters: false,
        parameters: [PARAMETER_A_DEFAULT_VALUE, PARAMETER_B_DEFAULT_VALUE],
        ordersQuestionId: ORDERS_QUESTION_ID,
        ordersCountQuestionId: ORDERS_COUNT_QUESTION_ID,
        createdAtField: ORDERS_CREATED_AT_FIELD,
        tabA: TAB_A,
        tabB: TAB_B,
      });
      await checkResetAllFiltersToDefaultWorksAcrossTabs(page, {
        autoApplyFilters: false,
        parameterAName: PARAMETER_A.name,
        parameterBName: PARAMETER_B.name,
      });
    });
  });

  test.describe("issue 46177", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("should update value inside popover when resetting value to default (metabase#46177)", async ({
      page,
      mb,
    }) => {
      const ORDERS_QUESTION_46177 = {
        name: "Orders question",
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
      };

      const targetField = ["field", ORDERS.TAX, null];
      const numberFilter = {
        name: "Number filter",
        slug: "number_filter",
        id: "10c0d4bc",
        type: "number/=",
        sectionId: "number",
        default: 2.9,
      };

      await createDashboardWithParameters(
        mb,
        page,
        ORDERS_QUESTION_46177,
        targetField,
        [numberFilter],
      );

      // update filter value
      await filter(page, numberFilter.name).click();
      await page
        .getByTestId("token-field")
        .getByLabel("Remove", { exact: true })
        .click();
      await page
        .getByTestId("token-field")
        .getByRole("combobox")
        .pressSequentially("3");
      await page.keyboard.press("Tab");
      await popover(page).getByText("Update filter", { exact: true }).click();

      await expect(
        filter(page, numberFilter.name).getByText("3", { exact: true }),
      ).toBeAttached();

      // reset value to default with filter widget open
      await filter(page, numberFilter.name).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await icon(filter(page, numberFilter.name), "revert").click();

      await expect(
        filter(page, numberFilter.name).getByText(String(numberFilter.default), {
          exact: true,
        }),
      ).toBeAttached();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  });

  test.describe("issue 57388", () => {
    test("should be possible to reset a required text filter to it's default value (metabase#57388)", async ({
      page,
      mb,
    }) => {
      const textFilter = {
        name: "Filter",
        slug: "filter",
        id: "75d67d39",
        type: "string/=",
        required: true,
        sectionId: "string",
        default: ["Gizmo", "Gadget", "Widget", "Doohickey"],
      };
      await createDashboardWithParameters(
        mb,
        page,
        ORDERS_QUESTION,
        PRODUCTS_CATEGORY_FIELD,
        [textFilter],
      );

      await filter(page, textFilter.name).click();
      const pop = popover(page);
      await pop.getByText("Select all", { exact: true }).click();
      await pop.getByText("Set to default", { exact: true }).click();
      await expect(filterWidget(page).nth(0)).toContainText("4 selections");
    });
  });
});
