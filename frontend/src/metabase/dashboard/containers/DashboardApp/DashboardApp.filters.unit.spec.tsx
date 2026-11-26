import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { addLocale, useLocale } from "ttag";

import { createMockMetadata } from "__support__/metadata";
import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDashboardParameterRemappingEndpoint,
  setupDashboardParameterSearchEndpoint,
  setupDashboardParameterValuesEndpoint,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupParameterRemappingEndpoint,
  setupParameterSearchValuesEndpoint,
  setupParameterValuesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  setupNotificationChannelsEndpoints,
  setupSubscriptionsEndpoint,
} from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForDashboardToLoad,
  within,
} from "__support__/ui";
import { deserializeCardFromUrl } from "metabase/common/utils/card";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  Dashboard,
  Field,
  Parameter,
  ParameterTarget,
  ParameterValues,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDataset,
  createMockParameter,
  createMockParameterMapping,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS,
  createOrdersIdField,
  createOrdersUserIdField,
  createPeopleCityField,
  createPeopleIdField,
  createPeopleNameField,
  createPeopleSourceField,
  createProductsIdField,
  createProductsTitleField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

registerVisualizations();
registerDashboardVisualizations();

const DASHBOARD_ID = 1;
const DASHCARD_ID = 2;

const ORDERS_CARD = createMockCard({
  id: 3,
  name: "Orders",
  display: "scalar",
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  }),
});

const UNFILTERED_TOTAL = "39.72";

const DASHCARD_QUERY_URL = `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${DASHCARD_ID}/card/${ORDERS_CARD.id}/query`;

type SentParameter = {
  id: string;
  type: string;
  value: unknown;
  target: ParameterTarget;
};

type ResultRule = {
  parameterId: string;
  value: unknown;
  total: string;
};

function isSentParameter(value: unknown): value is SentParameter {
  return isObject(value) && "id" in value && "value" in value;
}

function getSentParameters(body: unknown): SentParameter[] {
  const parsed: unknown = JSON.parse(String(body ?? "{}"));
  if (!isObject(parsed) || !("parameters" in parsed)) {
    return [];
  }
  const parameters: unknown = parsed.parameters;
  return Array.isArray(parameters) ? parameters.filter(isSentParameter) : [];
}

function isSameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Like the real backend, the card returns the filtered row only when exactly
// the expected parameter has the expected value, and the unfiltered row when
// no parameter has a value.
function setupFilteredDashcardQueryEndpoint(rules: ResultRule[]) {
  fetchMock.post(DASHCARD_QUERY_URL, (call) => {
    const sent = getSentParameters(call.options.body).filter(
      ({ value }) => value != null,
    );
    const rule = rules.find(
      ({ parameterId, value }) =>
        sent.length === 1 &&
        sent[0].id === parameterId &&
        isSameValue(sent[0].value, value),
    );
    const total =
      rule?.total ?? (sent.length === 0 ? UNFILTERED_TOTAL : "No match");
    return createMockDataset({
      data: {
        rows: [[total]],
        cols: [
          createMockColumn({
            name: "TOTAL",
            display_name: "Total",
            base_type: "type/Text",
          }),
        ],
      },
    });
  });
}

function getLastSentParameters() {
  const call = checkNotNull(fetchMock.callHistory.lastCall(DASHCARD_QUERY_URL));
  return getSentParameters(call.options.body);
}

function getLastSentValues() {
  return Object.fromEntries(
    getLastSentParameters()
      .filter(({ value }) => value != null)
      .map(({ id, value }) => [id, value]),
  );
}

// Like the real API, a GET after a PUT returns the updated dashboard
function setupPersistedDashboardEndpoints(dashboard: Dashboard) {
  let persistedDashboard = dashboard;
  fetchMock.get(
    `path:/api/dashboard/${dashboard.id}`,
    () => persistedDashboard,
  );
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, (call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    if (!isObject(body) || Array.isArray(body)) {
      throw new Error("Expected a dashboard update object");
    }
    const savedDashcards: unknown[] = Array.isArray(body.dashcards)
      ? body.dashcards
      : [];
    persistedDashboard = {
      ...persistedDashboard,
      ...body,
      // The real API returns each dashcard with its card, which the PUT body omits
      dashcards: persistedDashboard.dashcards.map((dashcard) => {
        const saved = savedDashcards.find(
          (item) => isObject(item) && item.id === dashcard.id,
        );
        return isObject(saved) && Array.isArray(saved.parameter_mappings)
          ? { ...dashcard, parameter_mappings: saved.parameter_mappings }
          : dashcard;
      }),
    };
    return persistedDashboard;
  });
}

function getSavedParameters(): unknown {
  const call = fetchMock.callHistory.lastCall(
    `path:/api/dashboard/${DASHBOARD_ID}`,
    { method: "PUT" },
  );
  expect(call).toBeDefined();
  const body: unknown = JSON.parse(String(call?.options.body));
  return isObject(body) ? body.parameters : undefined;
}

interface SetupOpts {
  parameters: Parameter[];
  targets: Record<string, ParameterTarget>;
  /** The fields that the API returns for each parameter of a saved dashboard */
  paramFields?: Record<string, Field[]>;
  rules?: ResultRule[];
  initialSearch?: string;
}

async function setup({
  parameters,
  targets,
  paramFields = {},
  rules = [],
  initialSearch = "",
}: SetupOpts) {
  const database = createSampleDatabase();
  const dashboard: Dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    parameters,
    param_fields: paramFields,
    dashcards: [
      createMockDashboardCard({
        id: DASHCARD_ID,
        dashboard_id: DASHBOARD_ID,
        card_id: ORDERS_CARD.id,
        card: ORDERS_CARD,
        size_x: 24,
        size_y: 8,
        parameter_mappings: parameters.map((parameter) =>
          createMockParameterMapping({
            parameter_id: parameter.id,
            card_id: ORDERS_CARD.id,
            target: targets[parameter.id],
          }),
        ),
      }),
    ],
  });

  setupNotificationChannelsEndpoints({});
  setupSubscriptionsEndpoint([]);
  setupDatabasesEndpoints([database]);
  setupPersistedDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({ databases: [database] }),
  );
  setupFilteredDashcardQueryEndpoint(rules);
  setupCollectionsEndpoints({ collections: [] });
  setupSearchEndpoints([]);
  setupCardsEndpoints([ORDERS_CARD]);
  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);

  const { router, unmount } = renderWithProviders(
    <>
      <Route path="/dashboard/:slug" element={<DashboardApp />} />
      <Route path="/question" element={<div data-testid="question-page" />} />
    </>,
    {
      initialRoute: `/dashboard/${DASHBOARD_ID}${initialSearch}`,
      withRouter: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [database] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );

  await waitForDashboardToLoad();

  return { router: checkNotNull(router), unmount, database };
}

function getFilterWidget(name: string) {
  return within(
    screen.getByTestId("dashboard-parameters-widget-container"),
  ).getByRole("button", { name });
}

async function openFilterWidget(name: string) {
  await userEvent.click(getFilterWidget(name));
  return screen.findByTestId("parameter-value-dropdown");
}

async function expectDashcardTotal(total: string) {
  const dashcard = screen.getByTestId("dashcard");
  expect(await within(dashcard).findByText(total)).toBeInTheDocument();
  if (total !== UNFILTERED_TOTAL) {
    expect(
      within(dashcard).queryByText(UNFILTERED_TOTAL),
    ).not.toBeInTheDocument();
  }
}

async function clearFilterWidget(name: string) {
  await userEvent.click(
    within(getFilterWidget(name)).getByRole("button", { name: "Clear" }),
  );
}

async function startEditing() {
  await userEvent.click(screen.getByLabelText("Edit dashboard"));
}

async function openParameterSidebar(name: string) {
  await userEvent.click(
    within(
      screen.getByTestId("edit-dashboard-parameters-widget-container"),
    ).getByText(name),
  );
  return screen.findByTestId("dashboard-parameter-sidebar");
}

function getSaveButton() {
  return within(screen.getByTestId("edit-bar")).getByRole("button", {
    name: "Save",
  });
}

async function saveDashboard() {
  await userEvent.click(getSaveButton());
  await waitFor(() =>
    expect(screen.queryByTestId("edit-bar")).not.toBeInTheDocument(),
  );
}

async function expectRequiredDefaultBlocksSaving(
  sidebar: HTMLElement,
  parameterName: string,
) {
  await userEvent.click(
    within(sidebar).getByLabelText("Always require a value"),
  );

  expect(getSaveButton()).toBeDisabled();
  await userEvent.hover(getSaveButton());
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    `The "${parameterName}" parameter requires a default value but none was provided.`,
  );
  await userEvent.unhover(getSaveButton());

  const doneButton = within(sidebar).getByRole("button", { name: "Done" });
  expect(doneButton).toBeDisabled();
  await userEvent.hover(doneButton);
  await waitFor(() =>
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "The parameter requires a default value but none was provided.",
    ),
  );
  await userEvent.unhover(doneButton);
}

async function openDefaultValuePicker(sidebar: HTMLElement) {
  await userEvent.click(
    within(sidebar).getByRole("button", { name: "No default" }),
  );
  return screen.findByTestId("parameter-value-dropdown");
}

type OperatorCase = {
  name: string;
  parameterId: string;
  value: unknown[];
  total: string;
  widgetText?: string | RegExp;
  pickValue: (dropdown: HTMLElement) => Promise<void>;
};

function typeAndAdd(text: string) {
  return async (dropdown: HTMLElement) => {
    await userEvent.type(within(dropdown).getByRole("textbox"), text);
    await userEvent.click(
      within(dropdown).getByRole("button", { name: "Add filter" }),
    );
  };
}

function typeInComboboxAndAdd(text: string) {
  return async (dropdown: HTMLElement) => {
    await userEvent.type(within(dropdown).getByRole("combobox"), text);
    await userEvent.click(
      within(dropdown).getByRole("button", { name: "Add filter" }),
    );
  };
}

function pickFromListAndAdd(label: string) {
  return async (dropdown: HTMLElement) => {
    await userEvent.click(await within(dropdown).findByText(label));
    await userEvent.click(
      within(dropdown).getByRole("button", { name: "Add filter" }),
    );
  };
}

async function expectOperatorCase(
  { name, parameterId, value, total, widgetText, pickValue }: OperatorCase,
  target: ParameterTarget,
) {
  await expectDashcardTotal(UNFILTERED_TOTAL);

  await pickValue(await openFilterWidget(name));

  await expectDashcardTotal(total);
  expect(getLastSentValues()).toEqual({ [parameterId]: value });
  expect(
    getLastSentParameters().find(({ id }) => id === parameterId),
  ).toMatchObject({ target });
  if (widgetText) {
    expect(getFilterWidget(name)).toHaveTextContent(widgetText);
  }

  await clearFilterWidget(name);
  await expectDashcardTotal(UNFILTERED_TOTAL);
  expect(getLastSentValues()).toEqual({});
}

const CREATED_AT_TARGET: ParameterTarget = [
  "dimension",
  ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
  { "stage-number": 0 },
];

const TAX_TARGET: ParameterTarget = [
  "dimension",
  ["field", ORDERS.TAX, { "base-type": "type/Float" }],
  { "stage-number": 0 },
];

const TOTAL_TARGET: ParameterTarget = [
  "dimension",
  ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
  { "stage-number": 0 },
];

const CITY_TARGET: ParameterTarget = [
  "dimension",
  [
    "field",
    PEOPLE.CITY,
    { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
  ],
  { "stage-number": 0 },
];

const SOURCE_TARGET: ParameterTarget = [
  "dimension",
  [
    "field",
    PEOPLE.SOURCE,
    { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
  ],
  { "stage-number": 0 },
];

const USER_ID_TARGET: ParameterTarget = [
  "dimension",
  ["field", ORDERS.USER_ID, { "base-type": "type/Integer" }],
  { "stage-number": 0 },
];

const ORDER_ID_TARGET: ParameterTarget = [
  "dimension",
  ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
  { "stage-number": 0 },
];

const PRODUCT_ID_TARGET: ParameterTarget = [
  "dimension",
  [
    "field",
    PRODUCTS.ID,
    { "base-type": "type/BigInteger", "source-field": ORDERS.PRODUCT_ID },
  ],
  { "stage-number": 0 },
];

const TITLE_TARGET: ParameterTarget = [
  "dimension",
  [
    "field",
    PRODUCTS.TITLE,
    { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
  ],
  { "stage-number": 0 },
];

// Like the real API, the user id field links to the people name field, so its values are remapped
const USER_ID_PARAM_FIELD = createOrdersUserIdField({
  target: createPeopleIdField({ name_field: createPeopleNameField() }),
});

const SOURCE_VALUES: ParameterValues = {
  values: [["Affiliate"], ["Facebook"], ["Google"], ["Organic"], ["Twitter"]],
  has_more_values: false,
};

describe("DashboardApp > filters", () => {
  describe("date", () => {
    const CURRENT_YEAR = new Date().getFullYear().toString();

    const DATE_PARAMETERS = [
      createMockParameter({
        id: "month-year",
        name: "Month and Year",
        slug: "month_and_year",
        type: "date/month-year",
        sectionId: "date",
      }),
      createMockParameter({
        id: "quarter-year",
        name: "Quarter and Year",
        slug: "quarter_and_year",
        type: "date/quarter-year",
        sectionId: "date",
      }),
      createMockParameter({
        id: "single",
        name: "Single Date",
        slug: "single_date",
        type: "date/single",
        sectionId: "date",
      }),
      createMockParameter({
        id: "range",
        name: "Date Range",
        slug: "date_range",
        type: "date/range",
        sectionId: "date",
      }),
      createMockParameter({
        id: "all-options",
        name: "Date Filter",
        slug: "date_filter",
        type: "date/all-options",
        sectionId: "date",
      }),
    ];

    const DATE_TARGETS = Object.fromEntries(
      DATE_PARAMETERS.map(({ id }) => [id, CREATED_AT_TARGET]),
    );

    const DATE_CASES: {
      name: string;
      parameterId: string;
      value: string;
      total: string;
      pickValue: (dropdown: HTMLElement) => Promise<void>;
    }[] = [
      {
        name: "Month and Year",
        parameterId: "month-year",
        value: "2025-11",
        total: "85.88",
        pickValue: async (dropdown) => {
          await userEvent.click(within(dropdown).getByText(CURRENT_YEAR));
          await userEvent.click(await within(dropdown).findByText("2025"));
          await userEvent.click(await within(dropdown).findByText("Nov"));
        },
      },
      {
        name: "Quarter and Year",
        parameterId: "quarter-year",
        value: "Q2-2025",
        total: "44.43",
        pickValue: async (dropdown) => {
          await userEvent.click(within(dropdown).getByText(CURRENT_YEAR));
          await userEvent.click(await within(dropdown).findByText("2025"));
          await userEvent.click(await within(dropdown).findByText("Q2"));
        },
      },
      {
        name: "Single Date",
        parameterId: "single",
        value: "2025-05-23T09:27:00",
        total: "49.54",
        pickValue: async (dropdown) => {
          const dateInput = within(dropdown).getByLabelText("Date");
          await userEvent.clear(dateInput);
          await userEvent.type(dateInput, "05/23/2025");
          await userEvent.click(within(dropdown).getByText("Add time"));
          const timeInput = within(dropdown).getByLabelText("Time");
          await userEvent.clear(timeInput);
          await userEvent.type(timeInput, "09:27");
          await userEvent.click(
            within(dropdown).getByRole("button", { name: "Add filter" }),
          );
        },
      },
      {
        name: "Date Range",
        parameterId: "range",
        value: "2025-05-25~2025-06-01",
        total: "75.41",
        pickValue: async (dropdown) => {
          const startInput = within(dropdown).getByLabelText("Start date");
          await userEvent.clear(startInput);
          await userEvent.type(startInput, "05/25/2025");
          const endInput = within(dropdown).getByLabelText("End date");
          await userEvent.clear(endInput);
          await userEvent.type(endInput, "06/01/2025");
          await userEvent.click(
            within(dropdown).getByRole("button", { name: "Add filter" }),
          );
        },
      },
      {
        name: "Date Filter",
        parameterId: "all-options",
        value: "~2025-06-01",
        total: "53.6",
        pickValue: async (dropdown) => {
          await userEvent.click(
            within(dropdown).getByText("Fixed date range…"),
          );
          await userEvent.click(within(dropdown).getByText("Before"));
          const dateInput = within(dropdown).getByLabelText("Date");
          await userEvent.clear(dateInput);
          await userEvent.type(dateInput, "06/01/2025");
          await userEvent.click(
            within(dropdown).getByRole("button", { name: "Add filter" }),
          );
        },
      },
    ];

    it.each(DATE_CASES)(
      "should filter the card by a $name filter set through its widget, and clear it",
      async ({ name, parameterId, value, total, pickValue }) => {
        await setup({
          parameters: DATE_PARAMETERS,
          targets: DATE_TARGETS,
          rules: [{ parameterId, value, total }],
        });
        await expectDashcardTotal(UNFILTERED_TOTAL);

        await pickValue(await openFilterWidget(name));

        await expectDashcardTotal(total);
        expect(getLastSentValues()).toEqual({ [parameterId]: value });
        expect(
          getLastSentParameters().find(({ id }) => id === parameterId),
        ).toMatchObject({ target: CREATED_AT_TARGET });

        await clearFilterWidget(name);
        await expectDashcardTotal(UNFILTERED_TOTAL);
        expect(getLastSentValues()).toEqual({});
      },
    );

    describe("all options filter", () => {
      const ALL_OPTIONS_PARAMETER = checkNotNull(
        DATE_PARAMETERS.find(({ id }) => id === "all-options"),
      );

      async function setupAllOptions() {
        return setup({
          parameters: [ALL_OPTIONS_PARAMETER],
          targets: { [ALL_OPTIONS_PARAMETER.id]: CREATED_AT_TARGET },
        });
      }

      afterEach(() => {
        jest.useRealTimers();
      });

      it("should round the relative date range preview to whole months (metabase#22482)", async () => {
        jest.useFakeTimers({ advanceTimers: true });
        jest.setSystemTime(new Date(2026, 10, 26, 12));
        await setupAllOptions();

        const dropdown = await openFilterWidget("Date Filter");
        await userEvent.click(
          within(dropdown).getByText("Relative date range…"),
        );
        const intervalInput = within(dropdown).getByLabelText("Interval");
        await userEvent.clear(intervalInput);
        await userEvent.type(intervalInput, "15");
        await userEvent.click(
          within(dropdown).getByRole("textbox", { name: "Unit" }),
        );
        await userEvent.click(
          await screen.findByRole("option", { name: "months" }),
        );

        expect(
          within(dropdown).getByText("Aug 1, 2025 – Oct 31, 2026"),
        ).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");
        await waitFor(() =>
          expect(
            screen.queryByTestId("parameter-value-dropdown"),
          ).not.toBeInTheDocument(),
        );
      });

      it("should unselect every excluded hour when select all is clicked twice (metabase#27579)", async () => {
        await setupAllOptions();

        const dropdown = await openFilterWidget("Date Filter");
        await userEvent.click(within(dropdown).getByText("Exclude…"));
        await userEvent.click(within(dropdown).getByText("Hours of the day…"));
        await userEvent.click(within(dropdown).getByLabelText("Select all"));
        expect(within(dropdown).getByLabelText("12 AM")).toBeChecked();
        expect(within(dropdown).getByLabelText("11 PM")).toBeChecked();

        await userEvent.click(within(dropdown).getByLabelText("Select all"));
        expect(within(dropdown).getByLabelText("12 AM")).not.toBeChecked();
        expect(within(dropdown).getByLabelText("11 PM")).not.toBeChecked();

        await userEvent.keyboard("{Escape}");
        await waitFor(() =>
          expect(
            screen.queryByTestId("parameter-value-dropdown"),
          ).not.toBeInTheDocument(),
        );
      });

      it("should not update an exclude filter once all of its options are unselected (metabase#24235)", async () => {
        await setupAllOptions();

        let dropdown = await openFilterWidget("Date Filter");
        await userEvent.click(within(dropdown).getByText("Exclude…"));
        await userEvent.click(within(dropdown).getByText("Days of the week…"));
        await userEvent.click(within(dropdown).getByLabelText("Select all"));
        await userEvent.click(
          within(dropdown).getByRole("button", { name: "Add filter" }),
        );
        await waitFor(() =>
          expect(getLastSentValues()).toEqual({
            "all-options": "exclude-days-Mon-Tue-Wed-Thu-Fri-Sat-Sun",
          }),
        );

        dropdown = await openFilterWidget("Date Filter");
        expect(within(dropdown).getByLabelText("Monday")).toBeChecked();
        await userEvent.click(within(dropdown).getByLabelText("Select all"));
        expect(within(dropdown).getByLabelText("Monday")).not.toBeChecked();
        expect(
          within(dropdown).getByRole("button", { name: "Update filter" }),
        ).toBeDisabled();
      });

      it("should offer sub-day units for a relative default value (metabase#6660), and keep the dropdown width unbounded (metabase#52918)", async () => {
        await setupAllOptions();
        await startEditing();
        const sidebar = await openParameterSidebar("Date Filter");

        let dropdown = await openDefaultValuePicker(sidebar);
        // jsdom has no layout, so this checks the style that lets the dropdown
        // grow to its content; the kept e2e test checks the rendered width
        expect(dropdown.style.getPropertyValue("max-width")).toMatch(
          /^100vw\b/,
        );
        await userEvent.click(within(dropdown).getByText("Fixed date range…"));
        expect(within(dropdown).getByText("Between")).toBeInTheDocument();
        await userEvent.click(
          within(dropdown).getByRole("button", { name: "Back" }),
        );

        dropdown = screen.getByTestId("parameter-value-dropdown");
        await userEvent.click(
          within(dropdown).getByText("Relative date range…"),
        );
        await userEvent.click(within(dropdown).getByText("Next"));
        await userEvent.click(within(dropdown).getByDisplayValue("days"));
        expect(
          await screen.findByRole("option", { name: "hours" }),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole("option", { name: "minutes" }));

        const includeCurrent =
          within(dropdown).getByLabelText(/Include this minute/);
        expect(includeCurrent).not.toBeChecked();
        await userEvent.click(includeCurrent);
        expect(includeCurrent).toBeChecked();
      });
    });

    describe("with a non-English locale", () => {
      const MONTHS = [
        ["Jan", "January"],
        ["Feb", "February"],
        ["Mar", "March"],
      ];
      const ZZ_STRINGS = [
        "Date picker",
        "Date",
        "Select…",
        "Exclude…",
        "Months of the year…",
        "Add filter",
        ...MONTHS.flat(),
      ];

      beforeEach(() => {
        addLocale("zz-fake", {
          headers: { "plural-forms": "nplurals=2; plural=(n != 1);" },
          translations: {
            "": Object.fromEntries(
              ZZ_STRINGS.map((msgid) => [
                msgid,
                { msgid, msgstr: [`[zz] ${msgid}`] },
              ]),
            ),
          },
        });
        useLocale("zz-fake");
      });

      afterEach(() => {
        useLocale("en");
      });

      it("should serialize an exclude filter with English month names (metabase#29122)", async () => {
        const { router } = await setup({ parameters: [], targets: {} });

        await startEditing();
        await userEvent.click(
          screen.getByLabelText("Add a filter or parameter"),
        );
        await userEvent.click(
          await screen.findByRole("menuitem", { name: "[zz] Date picker" }),
        );
        await userEvent.click(
          within(screen.getByTestId("dashcard")).getByText("[zz] Select…"),
        );
        // The card's own columns come first, then the implicitly joined
        // tables'; the request assertion below checks that Orders.Created At
        // is the mapped column
        const [ordersCreatedAt] = await screen.findAllByRole("option", {
          name: "Created At",
        });
        await userEvent.click(within(ordersCreatedAt).getByText("Created At"));
        await saveDashboard();

        const dropdown = await openFilterWidget("[zz] Date");
        await userEvent.click(within(dropdown).getByText("[zz] Exclude…"));
        await userEvent.click(
          within(dropdown).getByText("[zz] Months of the year…"),
        );
        await userEvent.click(within(dropdown).getByLabelText("January"));
        await userEvent.click(
          within(dropdown).getByRole("button", { name: "[zz] Add filter" }),
        );

        // The slug comes from the translated default name, "[zz] Date"
        await waitFor(() =>
          expect(router.location.search).toMatch(
            /^\?[^=]*date=exclude-months-Jan$/,
          ),
        );
        expect(Object.values(getLastSentValues())).toEqual([
          "exclude-months-Jan",
        ]);
        expect(
          getLastSentParameters().find(({ value }) => value != null),
        ).toMatchObject({
          type: "date/all-options",
          target: [
            "dimension",
            ["field", ORDERS.CREATED_AT, expect.anything()],
            { "stage-number": 0 },
          ],
        });
      });
    });

    it("should require a default value, then apply it, change it and reset it", async () => {
      const parameter = checkNotNull(
        DATE_PARAMETERS.find(({ id }) => id === "month-year"),
      );
      await setup({
        parameters: [parameter],
        targets: { [parameter.id]: CREATED_AT_TARGET },
        rules: [
          { parameterId: parameter.id, value: "2026-11", total: "27.74" },
          { parameterId: parameter.id, value: "2026-12", total: "76.83" },
        ],
      });
      await startEditing();
      const sidebar = await openParameterSidebar("Month and Year");

      await expectRequiredDefaultBlocksSaving(sidebar, "Month and Year");

      const dropdown = await openDefaultValuePicker(sidebar);
      await userEvent.click(within(dropdown).getByText(CURRENT_YEAR));
      await userEvent.click(await within(dropdown).findByText("2026"));
      await userEvent.click(await within(dropdown).findByText("Nov"));
      expect(getSaveButton()).toBeEnabled();

      await saveDashboard();
      expect(getSavedParameters()).toEqual([
        expect.objectContaining({
          id: parameter.id,
          required: true,
          default: "2026-11",
        }),
      ]);
      await expectDashcardTotal("27.74");
      expect(getLastSentValues()).toEqual({ [parameter.id]: "2026-11" });
      expect(getFilterWidget("Month and Year")).toHaveTextContent(
        "November 2026",
      );

      const widgetDropdown = await openFilterWidget("Month and Year");
      await userEvent.click(within(widgetDropdown).getByText("Dec"));
      await expectDashcardTotal("76.83");
      expect(getLastSentValues()).toEqual({ [parameter.id]: "2026-12" });
      expect(getFilterWidget("Month and Year")).toHaveTextContent(
        "December 2026",
      );

      await userEvent.click(
        within(getFilterWidget("Month and Year")).getByRole("button", {
          name: "Reset filter to default state",
        }),
      );
      await expectDashcardTotal("27.74");
      expect(getLastSentValues()).toEqual({ [parameter.id]: "2026-11" });
      expect(getFilterWidget("Month and Year")).toHaveTextContent(
        "November 2026",
      );
    });
  });

  describe("number", () => {
    const NUMBER_PARAMETERS = [
      createMockParameter({
        id: "equal",
        name: "Equal to",
        slug: "equal_to",
        type: "number/=",
        sectionId: "number",
      }),
      createMockParameter({
        id: "equal-single",
        name: "Equal to single",
        slug: "equal_to_single",
        type: "number/=",
        sectionId: "number",
        isMultiSelect: false,
      }),
      createMockParameter({
        id: "not-equal",
        name: "Not equal to",
        slug: "not_equal_to",
        type: "number/!=",
        sectionId: "number",
      }),
      createMockParameter({
        id: "not-equal-single",
        name: "Not equal to single",
        slug: "not_equal_to_single",
        type: "number/!=",
        sectionId: "number",
        isMultiSelect: false,
      }),
      createMockParameter({
        id: "greater",
        name: "Greater than or equal to",
        slug: "greater_than_or_equal_to",
        type: "number/>=",
        sectionId: "number",
      }),
      createMockParameter({
        id: "less",
        name: "Less than or equal to",
        slug: "less_than_or_equal_to",
        type: "number/<=",
        sectionId: "number",
      }),
      createMockParameter({
        id: "between",
        name: "Between",
        slug: "between",
        type: "number/between",
        sectionId: "number",
      }),
    ];

    const NUMBER_TARGETS = Object.fromEntries(
      NUMBER_PARAMETERS.map(({ id }) => [
        id,
        id === "between" ? TOTAL_TARGET : TAX_TARGET,
      ]),
    );

    const NUMBER_CASES: OperatorCase[] = [
      {
        name: "Equal to",
        parameterId: "equal",
        value: [2.07],
        total: "37.65",
        pickValue: typeInComboboxAndAdd("2.07"),
      },
      {
        name: "Equal to single",
        parameterId: "equal-single",
        value: [2.07],
        total: "37.65",
        pickValue: typeAndAdd("2.07"),
      },
      {
        name: "Not equal to",
        parameterId: "not-equal",
        value: [2.07],
        total: "110.93",
        pickValue: typeInComboboxAndAdd("2.07"),
      },
      {
        name: "Not equal to single",
        parameterId: "not-equal-single",
        value: [2.07],
        total: "110.93",
        pickValue: typeAndAdd("2.07"),
      },
      {
        name: "Greater than or equal to",
        parameterId: "greater",
        value: [6.01],
        total: "110.93",
        pickValue: typeAndAdd("6.01"),
      },
      {
        name: "Less than or equal to",
        parameterId: "less",
        value: [2],
        total: "29.8",
        pickValue: typeAndAdd("2"),
      },
    ];

    it.each(NUMBER_CASES)(
      "should filter the card by a $name filter set through its widget, and clear it",
      async (operatorCase) => {
        await setup({
          parameters: NUMBER_PARAMETERS,
          targets: NUMBER_TARGETS,
          rules: [operatorCase],
        });
        await expectOperatorCase(
          operatorCase,
          NUMBER_TARGETS[operatorCase.parameterId],
        );
      },
    );

    it("should send a between filter without its min or its max (metabase#54364)", async () => {
      await setup({
        parameters: NUMBER_PARAMETERS,
        targets: NUMBER_TARGETS,
        rules: [
          { parameterId: "between", value: [150], total: "256 rows" },
          { parameterId: "between", value: [null, 20], total: "52 rows" },
          { parameterId: "between", value: [150, 155], total: "166 rows" },
        ],
      });
      const getInputs = (dropdown: HTMLElement) => {
        const inputs =
          within(dropdown).getAllByPlaceholderText("Enter a number");
        expect(inputs).toHaveLength(2);
        return inputs;
      };

      let dropdown = await openFilterWidget("Between");
      let [minInput, maxInput] = getInputs(dropdown);
      await userEvent.type(minInput, "150");
      await userEvent.click(
        within(dropdown).getByRole("button", { name: "Add filter" }),
      );
      await expectDashcardTotal("256 rows");
      expect(getLastSentValues()).toEqual({ between: [150] });

      dropdown = await openFilterWidget("Between");
      [minInput, maxInput] = getInputs(dropdown);
      await userEvent.clear(minInput);
      await userEvent.type(maxInput, "20");
      await userEvent.click(
        within(dropdown).getByRole("button", { name: "Update filter" }),
      );
      await expectDashcardTotal("52 rows");
      expect(getLastSentValues()).toEqual({ between: [null, 20] });

      dropdown = await openFilterWidget("Between");
      [minInput, maxInput] = getInputs(dropdown);
      await userEvent.clear(minInput);
      await userEvent.type(minInput, "150");
      await userEvent.clear(maxInput);
      await userEvent.type(maxInput, "155");
      await userEvent.click(
        within(dropdown).getByRole("button", { name: "Update filter" }),
      );
      await expectDashcardTotal("166 rows");
      expect(getLastSentValues()).toEqual({ between: [150, 155] });
    });
  });

  describe("location", () => {
    const LOCATION_OPERATORS = [
      ["Is", "string/=", "Abbeville", "1510"],
      ["Is not", "string/!=", "Wood River", "148.23"],
      ["Contains", "string/contains", "bbev", "1510"],
      ["Does not contain", "string/does-not-contain", "d", "47.68"],
      ["Starts with", "string/starts-with", "Lake", "122.37"],
      ["Ends with", "string/ends-with", "y", "115.24"],
    ] as const;

    const LOCATION_PARAMETERS = LOCATION_OPERATORS.map(([name, type]) =>
      createMockParameter({
        id: type,
        name,
        slug: type.replace(/\W/g, "_"),
        type,
        sectionId: "location",
      }),
    );

    const LOCATION_TARGETS = Object.fromEntries(
      LOCATION_PARAMETERS.map(({ id }) => [id, CITY_TARGET]),
    );

    const LOCATION_CASES: OperatorCase[] = LOCATION_OPERATORS.map(
      ([name, type, text, total]) => ({
        name,
        parameterId: type,
        value: [text],
        total,
        widgetText: text,
        pickValue: typeInComboboxAndAdd(text),
      }),
    );

    function setupCityValues() {
      LOCATION_PARAMETERS.forEach(({ id }) => {
        const parameterValues: ParameterValues = {
          values: [["Abbeville"], ["Lake Ann"], ["Wood River"]],
          has_more_values: true,
        };
        setupDashboardParameterValuesEndpoint({
          dashboardId: DASHBOARD_ID,
          parameterId: id,
          parameterValues,
        });
        setupDashboardParameterSearchEndpoint({
          dashboardId: DASHBOARD_ID,
          parameterId: id,
          parameterValues,
        });
      });
    }

    it.each(LOCATION_CASES)(
      "should filter the card by an $name location filter set through its widget, and clear it",
      async (operatorCase) => {
        setupCityValues();
        await setup({
          parameters: LOCATION_PARAMETERS,
          targets: LOCATION_TARGETS,
          paramFields: Object.fromEntries(
            LOCATION_PARAMETERS.map(({ id }) => [
              id,
              [createPeopleCityField()],
            ]),
          ),
          rules: [operatorCase],
        });
        await expectOperatorCase(
          operatorCase,
          LOCATION_TARGETS[operatorCase.parameterId],
        );
      },
    );
  });

  describe("text", () => {
    const TEXT_OPERATORS = [
      ["Is", "string/=", false],
      ["Is not", "string/!=", false],
      ["Contains", "string/contains", true],
      ["Contains single", "string/contains", false],
      ["Does not contain", "string/does-not-contain", true],
      ["Does not contain single", "string/does-not-contain", false],
      ["Starts with", "string/starts-with", true],
      ["Starts with single", "string/starts-with", false],
      ["Ends with", "string/ends-with", true],
      ["Ends with single", "string/ends-with", false],
    ] as const;

    const TEXT_PARAMETERS = TEXT_OPERATORS.map(([name, type, isMultiSelect]) =>
      createMockParameter({
        id: name.replace(/\W/g, "-").toLowerCase(),
        name,
        slug: name.replace(/\W/g, "_").toLowerCase(),
        type,
        sectionId: "string",
        isMultiSelect,
      }),
    );

    const TEXT_TARGETS = Object.fromEntries(
      TEXT_PARAMETERS.map(({ id }) => [id, SOURCE_TARGET]),
    );

    const TEXT_CASES: OperatorCase[] = [
      {
        name: "Is",
        parameterId: "is",
        value: ["Organic"],
        total: "39.58",
        widgetText: "Organic",
        pickValue: pickFromListAndAdd("Organic"),
      },
      {
        name: "Is not",
        parameterId: "is-not",
        value: ["Twitter"],
        total: "148.23",
        widgetText: "Twitter",
        pickValue: pickFromListAndAdd("Twitter"),
      },
      {
        name: "Contains",
        parameterId: "contains",
        value: ["oo", "aa"],
        total: "148.23",
        widgetText: "2 selections",
        pickValue: typeInComboboxAndAdd("oo,aa"),
      },
      {
        name: "Contains single",
        parameterId: "contains-single",
        value: ['"oo,aa"'],
        total: "No results",
        widgetText: "oo,aa",
        pickValue: typeAndAdd('"oo,aa"'),
      },
      {
        name: "Does not contain",
        parameterId: "does-not-contain",
        value: ["oo", "tt"],
        total: "39.58",
        widgetText: "2 selections",
        pickValue: typeInComboboxAndAdd("oo,tt"),
      },
      {
        name: "Does not contain single",
        parameterId: "does-not-contain-single",
        value: ['"oo,tt"'],
        total: "37.65",
        widgetText: "oo,tt",
        pickValue: typeAndAdd('"oo,tt"'),
      },
      {
        name: "Starts with",
        parameterId: "starts-with",
        value: ["A", "b"],
        total: "85.72",
        widgetText: "2 selections",
        pickValue: typeInComboboxAndAdd("A,b"),
      },
      {
        name: "Starts with single",
        parameterId: "starts-with-single",
        value: ['"A,b"'],
        total: "No results",
        widgetText: "A,b",
        pickValue: typeAndAdd('"A,b"'),
      },
      {
        name: "Ends with",
        parameterId: "ends-with",
        value: ["e", "s"],
        total: "47.68",
        widgetText: "2 selections",
        pickValue: typeInComboboxAndAdd("e,s"),
      },
      {
        name: "Ends with single",
        parameterId: "ends-with-single",
        value: ['"e,s"'],
        total: "No results",
        widgetText: "e,s",
        pickValue: typeAndAdd('"e,s"'),
      },
    ];

    function setupSourceValues() {
      TEXT_PARAMETERS.forEach(({ id }) => {
        setupDashboardParameterValuesEndpoint({
          dashboardId: DASHBOARD_ID,
          parameterId: id,
          parameterValues: SOURCE_VALUES,
        });
      });
    }

    it.each(TEXT_CASES)(
      "should filter the card by a $name text filter set through its widget, and clear it",
      async (operatorCase) => {
        setupSourceValues();
        await setup({
          parameters: TEXT_PARAMETERS,
          targets: TEXT_TARGETS,
          paramFields: Object.fromEntries(
            TEXT_PARAMETERS.map(({ id }) => [id, [createPeopleSourceField()]]),
          ),
          rules: [operatorCase],
        });
        await expectOperatorCase(
          operatorCase,
          TEXT_TARGETS[operatorCase.parameterId],
        );
      },
    );
  });

  describe("required filters", () => {
    it("should require a default number value, then apply it, change it, reset it, and restore it when the value is removed", async () => {
      const parameter = createMockParameter({
        id: "equal",
        name: "Equal to",
        slug: "equal_to",
        type: "number/=",
        sectionId: "number",
      });
      await setup({
        parameters: [parameter],
        targets: { [parameter.id]: TAX_TARGET },
        rules: [
          { parameterId: parameter.id, value: [2.07], total: "37.65" },
          { parameterId: parameter.id, value: [5.27], total: "95.77" },
        ],
      });
      await startEditing();
      const sidebar = await openParameterSidebar("Equal to");

      await expectRequiredDefaultBlocksSaving(sidebar, "Equal to");

      const dropdown = await openDefaultValuePicker(sidebar);
      await userEvent.type(
        within(dropdown).getByPlaceholderText("Enter a number"),
        "2.07",
      );
      await userEvent.click(
        within(dropdown).getByRole("button", { name: "Update filter" }),
      );

      await saveDashboard();
      expect(getSavedParameters()).toEqual([
        expect.objectContaining({
          id: parameter.id,
          required: true,
          default: [2.07],
        }),
      ]);
      await expectDashcardTotal("37.65");
      expect(getLastSentValues()).toEqual({ [parameter.id]: [2.07] });

      const setWidgetValue = async (
        text: string | null,
        buttonLabel: string,
      ) => {
        const widgetDropdown = await openFilterWidget("Equal to");
        await userEvent.click(within(widgetDropdown).getByLabelText("Remove"));
        if (text) {
          await userEvent.type(
            within(widgetDropdown).getByPlaceholderText("Enter a number"),
            text,
          );
        }
        await userEvent.click(
          within(widgetDropdown).getByRole("button", { name: buttonLabel }),
        );
      };

      await setWidgetValue("5.27", "Update filter");
      await expectDashcardTotal("95.77");
      expect(getLastSentValues()).toEqual({ [parameter.id]: [5.27] });

      await userEvent.click(
        within(getFilterWidget("Equal to")).getByRole("button", {
          name: "Reset filter to default state",
        }),
      );
      await expectDashcardTotal("37.65");
      expect(getLastSentValues()).toEqual({ [parameter.id]: [2.07] });
      expect(getFilterWidget("Equal to")).toHaveTextContent("2.07");

      await setWidgetValue("5.27", "Update filter");
      await expectDashcardTotal("95.77");

      await setWidgetValue(null, "Set to default");
      await expectDashcardTotal("37.65");
      expect(getLastSentValues()).toEqual({ [parameter.id]: [2.07] });
      expect(getFilterWidget("Equal to")).toHaveTextContent("2.07");
    });

    it("should require a default text value, then apply it, change it, reset it, and restore it when every value is unselected", async () => {
      const parameter = createMockParameter({
        id: "text",
        name: "Text",
        slug: "text",
        type: "string/=",
        sectionId: "string",
      });
      setupDashboardParameterValuesEndpoint({
        dashboardId: DASHBOARD_ID,
        parameterId: parameter.id,
        parameterValues: SOURCE_VALUES,
      });
      setupParameterValuesEndpoints(SOURCE_VALUES);
      const ORGANIC_GOOGLE_TWITTER = ["Organic", "Google", "Twitter"];
      await setup({
        parameters: [parameter],
        targets: { [parameter.id]: SOURCE_TARGET },
        paramFields: { [parameter.id]: [createPeopleSourceField()] },
        rules: [
          { parameterId: parameter.id, value: ["Organic"], total: "39.58" },
          {
            parameterId: parameter.id,
            value: ORGANIC_GOOGLE_TWITTER,
            total: "37.65",
          },
        ],
      });
      await startEditing();
      const sidebar = await openParameterSidebar("Text");

      await expectRequiredDefaultBlocksSaving(sidebar, "Text");

      const dropdown = await openDefaultValuePicker(sidebar);
      await userEvent.click(await within(dropdown).findByText("Organic"));
      await userEvent.click(
        within(dropdown).getByRole("button", { name: "Update filter" }),
      );

      await saveDashboard();
      expect(getSavedParameters()).toEqual([
        expect.objectContaining({
          id: parameter.id,
          required: true,
          default: ["Organic"],
        }),
      ]);
      await expectDashcardTotal("39.58");
      expect(getLastSentValues()).toEqual({ [parameter.id]: ["Organic"] });

      const toggleValues = async (labels: string[], buttonLabel: string) => {
        const widgetDropdown = await openFilterWidget("Text");
        for (const label of labels) {
          await userEvent.click(await within(widgetDropdown).findByText(label));
        }
        await userEvent.click(
          within(widgetDropdown).getByRole("button", { name: buttonLabel }),
        );
      };

      await toggleValues(["Google", "Twitter"], "Update filter");
      await expectDashcardTotal("37.65");
      expect(getLastSentValues()).toEqual({
        [parameter.id]: ORGANIC_GOOGLE_TWITTER,
      });

      await userEvent.click(
        within(getFilterWidget("Text")).getByRole("button", {
          name: "Reset filter to default state",
        }),
      );
      await expectDashcardTotal("39.58");
      expect(getLastSentValues()).toEqual({ [parameter.id]: ["Organic"] });
      expect(getFilterWidget("Text")).toHaveTextContent("Organic");

      await toggleValues(["Google", "Twitter"], "Update filter");
      await expectDashcardTotal("37.65");

      await toggleValues(ORGANIC_GOOGLE_TWITTER, "Set to default");
      await waitFor(() =>
        expect(
          screen.queryByTestId("parameter-value-dropdown"),
        ).not.toBeInTheDocument(),
      );
      await expectDashcardTotal("39.58");
      expect(getLastSentValues()).toEqual({ [parameter.id]: ["Organic"] });
      expect(getFilterWidget("Text")).toHaveTextContent("Organic");
    });
  });

  describe("default values", () => {
    it("should apply a default location value, clear it, and offer to set it back", async () => {
      const parameter = createMockParameter({
        id: "city",
        name: "Is",
        slug: "is",
        type: "string/=",
        sectionId: "location",
      });
      const parameterValues: ParameterValues = {
        values: [["Abbeville"], ["Lake Ann"], ["Wood River"]],
        has_more_values: true,
      };
      setupDashboardParameterValuesEndpoint({
        dashboardId: DASHBOARD_ID,
        parameterId: parameter.id,
        parameterValues,
      });
      setupDashboardParameterSearchEndpoint({
        dashboardId: DASHBOARD_ID,
        parameterId: parameter.id,
        parameterValues,
      });
      setupParameterSearchValuesEndpoint("Abbev", {
        values: [["Abbeville"]],
        has_more_values: false,
      });
      await setup({
        parameters: [parameter],
        targets: { [parameter.id]: CITY_TARGET },
        paramFields: { [parameter.id]: [createPeopleCityField()] },
        rules: [
          { parameterId: parameter.id, value: ["Abbeville"], total: "1510" },
        ],
      });
      await startEditing();
      const sidebar = await openParameterSidebar("Is");
      const dropdown = await openDefaultValuePicker(sidebar);
      await userEvent.type(within(dropdown).getByRole("combobox"), "Abbev");
      await userEvent.click(
        await screen.findByRole("option", { name: "Abbeville" }),
      );
      await userEvent.click(
        within(dropdown).getByRole("button", { name: "Add filter" }),
      );

      await saveDashboard();
      expect(getSavedParameters()).toEqual([
        expect.objectContaining({ id: parameter.id, default: ["Abbeville"] }),
      ]);
      await expectDashcardTotal("1510");
      expect(getLastSentValues()).toEqual({ [parameter.id]: ["Abbeville"] });

      await clearFilterWidget("Is");
      await expectDashcardTotal(UNFILTERED_TOTAL);
      expect(getLastSentValues()).toEqual({});

      const widgetDropdown = await openFilterWidget("Is");
      await userEvent.type(
        within(widgetDropdown).getByRole("combobox"),
        "Abbeville",
      );
      await userEvent.click(
        within(widgetDropdown).getByRole("button", { name: "Set to default" }),
      );
      await expectDashcardTotal("1510");
      expect(getLastSentValues()).toEqual({ [parameter.id]: ["Abbeville"] });
    });

    it("should apply the default value of each id filter: the primary key, the foreign key, and the implicit join", async () => {
      const ID_FILTERS = [
        {
          parameter: createMockParameter({
            id: "order-id",
            name: "Order ID",
            slug: "order_id",
            type: "id",
            sectionId: "id",
          }),
          target: ORDER_ID_TARGET,
          field: createOrdersIdField(),
          text: "15",
          value: [15],
          total: "114.42",
          widgetText: "15",
        },
        {
          parameter: createMockParameter({
            id: "user-id",
            name: "User ID",
            slug: "user_id",
            type: "id",
            sectionId: "id",
          }),
          target: USER_ID_TARGET,
          field: USER_ID_PARAM_FIELD,
          text: "4",
          value: [4],
          total: "47.68",
          widgetText: "Arnold Adams - 4",
        },
        {
          parameter: createMockParameter({
            id: "product-id",
            name: "Product ID",
            slug: "product_id",
            type: "id",
            sectionId: "id",
          }),
          target: PRODUCT_ID_TARGET,
          field: createProductsIdField(),
          text: "10",
          value: [10],
          total: "6.75",
          widgetText: "10",
        },
      ];
      setupDashboardParameterRemappingEndpoint({
        dashboardId: DASHBOARD_ID,
        parameterId: "user-id",
        remappings: [[4, "Arnold Adams"]],
      });
      setupParameterRemappingEndpoint([[4, "Arnold Adams"]]);
      await setup({
        parameters: ID_FILTERS.map(({ parameter }) => parameter),
        targets: Object.fromEntries(
          ID_FILTERS.map(({ parameter, target }) => [parameter.id, target]),
        ),
        paramFields: Object.fromEntries(
          ID_FILTERS.map(({ parameter, field }) => [parameter.id, [field]]),
        ),
        rules: ID_FILTERS.map(({ parameter, value, total }) => ({
          parameterId: parameter.id,
          value,
          total,
        })),
      });

      await startEditing();
      for (const { parameter, text } of ID_FILTERS) {
        const sidebar = await openParameterSidebar(parameter.name);
        const dropdown = await openDefaultValuePicker(sidebar);
        await userEvent.type(within(dropdown).getByRole("combobox"), text);
        await userEvent.click(
          within(dropdown).getByRole("button", { name: "Add filter" }),
        );
      }
      await saveDashboard();
      expect(getSavedParameters()).toEqual(
        ID_FILTERS.map(({ parameter, value }) =>
          expect.objectContaining({ id: parameter.id, default: value }),
        ),
      );
      await waitFor(() =>
        expect(getLastSentValues()).toEqual(
          Object.fromEntries(
            ID_FILTERS.map(({ parameter, value }) => [parameter.id, value]),
          ),
        ),
      );

      for (const filter of ID_FILTERS) {
        const others = ID_FILTERS.filter((other) => other !== filter);
        for (const other of others) {
          await clearFilterWidget(other.parameter.name);
        }
        await expectDashcardTotal(filter.total);
        expect(getLastSentValues()).toEqual({
          [filter.parameter.id]: filter.value,
        });
        expect(
          getLastSentParameters().find(({ id }) => id === filter.parameter.id),
        ).toMatchObject({ target: filter.target });
        expect(getFilterWidget(filter.parameter.name)).toHaveTextContent(
          filter.widgetText,
        );

        for (const other of others) {
          await userEvent.click(
            within(getFilterWidget(other.parameter.name)).getByRole("button", {
              name: "Reset filter to default state",
            }),
          );
        }
        await waitFor(() =>
          expect(Object.keys(getLastSentValues())).toHaveLength(3),
        );
      }
    });

    it("should not restore a cleared default value on reload (metabase#13960)", async () => {
      const textParameter = createMockParameter({
        id: "text",
        name: "Text",
        slug: "text",
        type: "string/=",
        sectionId: "string",
        default: ["Organic"],
      });
      const idParameter = createMockParameter({
        id: "id",
        name: "ID",
        slug: "id",
        type: "id",
        sectionId: "id",
      });
      const setupReloadable = (initialSearch?: string) => {
        setupDashboardParameterValuesEndpoint({
          dashboardId: DASHBOARD_ID,
          parameterId: textParameter.id,
          parameterValues: SOURCE_VALUES,
        });
        setupDashboardParameterRemappingEndpoint({
          dashboardId: DASHBOARD_ID,
          parameterId: idParameter.id,
          remappings: [[4, "Arnold Adams"]],
        });
        return setup({
          parameters: [textParameter, idParameter],
          targets: {
            [textParameter.id]: SOURCE_TARGET,
            [idParameter.id]: USER_ID_TARGET,
          },
          paramFields: {
            [textParameter.id]: [createPeopleSourceField()],
            [idParameter.id]: [USER_ID_PARAM_FIELD],
          },
          rules: [
            {
              parameterId: textParameter.id,
              value: ["Organic"],
              total: "39.58",
            },
            { parameterId: idParameter.id, value: [4], total: "47.68" },
          ],
          initialSearch,
        });
      };

      const { router, unmount } = await setupReloadable();
      await waitFor(() =>
        expect(router.location.search).toBe("?id=&text=Organic"),
      );
      await expectDashcardTotal("39.58");
      expect(getLastSentValues()).toEqual({ text: ["Organic"] });

      await clearFilterWidget("Text");
      await waitFor(() => expect(router.location.search).toBe("?id=&text="));
      await expectDashcardTotal(UNFILTERED_TOTAL);
      expect(getLastSentValues()).toEqual({});

      const dropdown = await openFilterWidget("ID");
      await userEvent.type(
        within(dropdown).getByPlaceholderText("Enter an ID"),
        "4{enter}",
      );
      await userEvent.click(
        within(dropdown).getByRole("button", { name: "Add filter" }),
      );
      await waitFor(() => expect(router.location.search).toBe("?id=4&text="));
      await expectDashcardTotal("47.68");
      expect(getLastSentValues()).toEqual({ id: [4] });

      const search = router.location.search;
      unmount();
      fetchMock.removeRoutes();
      fetchMock.clearHistory();
      const reloaded = await setupReloadable(search);

      await expectDashcardTotal("47.68");
      expect(getLastSentValues()).toEqual({ id: [4] });
      expect(reloaded.router.location.search).toBe("?id=4&text=");
      expect(getFilterWidget("Text")).toHaveTextContent("Text");
      expect(getFilterWidget("Text")).not.toHaveTextContent("Organic");
      expect(
        await within(getFilterWidget("ID")).findByText(/Arnold Adams/),
      ).toBeInTheDocument();
    });
  });

  describe("text filter values", () => {
    it("should reset the filter when all of its values are unselected (metabase#25533)", async () => {
      const parameter = createMockParameter({
        id: "source",
        name: "Source",
        slug: "source",
        type: "string/=",
        sectionId: "string",
      });
      setupDashboardParameterValuesEndpoint({
        dashboardId: DASHBOARD_ID,
        parameterId: parameter.id,
        parameterValues: SOURCE_VALUES,
      });
      const { router } = await setup({
        parameters: [parameter],
        targets: { [parameter.id]: SOURCE_TARGET },
        paramFields: { [parameter.id]: [createPeopleSourceField()] },
        rules: [
          { parameterId: parameter.id, value: ["Organic"], total: "39.58" },
        ],
      });

      let dropdown = await openFilterWidget("Source");
      await userEvent.click(await within(dropdown).findByText("Organic"));
      await userEvent.click(
        within(dropdown).getByRole("button", { name: "Add filter" }),
      );
      await expectDashcardTotal("39.58");
      expect(getFilterWidget("Source")).toHaveTextContent("Organic");
      expect(
        within(getFilterWidget("Source")).getByRole("button", {
          name: "Clear",
        }),
      ).toBeInTheDocument();

      dropdown = await openFilterWidget("Source");
      await userEvent.click(await within(dropdown).findByText("Organic"));
      await userEvent.click(
        within(dropdown).getByRole("button", { name: "Update filter" }),
      );
      await expectDashcardTotal(UNFILTERED_TOTAL);
      expect(getLastSentValues()).toEqual({});
      expect(getFilterWidget("Source")).not.toHaveTextContent("Organic");
      expect(
        within(getFilterWidget("Source")).queryByRole("button", {
          name: "Clear",
        }),
      ).not.toBeInTheDocument();
      expect(router.location.search).toMatch(/[?&]source=(&|$)/);
    });

    it("should default to multiple values, and use the list picker for single- and multi-value filters (metabase#49323)", async () => {
      const TITLE_VALUES: ParameterValues = {
        values: [
          ["Aerodynamic Bronze Hat"],
          ["Aerodynamic Concrete Bench"],
          ["Aerodynamic Concrete Lamp"],
        ],
        has_more_values: false,
      };
      const singleTitle = createMockParameter({
        id: "single-title",
        name: "Single title",
        slug: "single_title",
        type: "string/=",
        sectionId: "string",
      });
      const multipleTitles = createMockParameter({
        id: "multiple-titles",
        name: "Multiple titles",
        slug: "multiple_titles",
        type: "string/=",
        sectionId: "string",
      });
      [singleTitle, multipleTitles].forEach(({ id }) =>
        setupDashboardParameterValuesEndpoint({
          dashboardId: DASHBOARD_ID,
          parameterId: id,
          parameterValues: TITLE_VALUES,
        }),
      );
      const titleField = createProductsTitleField({ has_field_values: "list" });
      await setup({
        parameters: [singleTitle, multipleTitles],
        targets: {
          [singleTitle.id]: TITLE_TARGET,
          [multipleTitles.id]: TITLE_TARGET,
        },
        paramFields: {
          [singleTitle.id]: [titleField],
          [multipleTitles.id]: [titleField],
        },
        rules: [
          {
            parameterId: singleTitle.id,
            value: ["Aerodynamic Bronze Hat"],
            total: "84.04",
          },
          {
            parameterId: multipleTitles.id,
            value: ["Aerodynamic Concrete Bench", "Aerodynamic Bronze Hat"],
            total: "130.2",
          },
        ],
      });

      await startEditing();
      const sidebar = await openParameterSidebar("Single title");
      expect(
        within(sidebar).getByRole("radio", { name: "Multiple values" }),
      ).toBeChecked();
      await userEvent.click(
        within(sidebar).getByRole("radio", { name: "A single value" }),
      );
      expect(
        within(sidebar).getByRole("radio", { name: "A single value" }),
      ).toBeChecked();
      await saveDashboard();
      expect(getSavedParameters()).toEqual([
        expect.objectContaining({ id: singleTitle.id, isMultiSelect: false }),
        expect.not.objectContaining({ isMultiSelect: false }),
      ]);

      const cases = [
        {
          parameter: singleTitle,
          listTestId: "single-select-list-field",
          widgetText: "Aerodynamic Bronze Hat",
          value: ["Aerodynamic Bronze Hat"],
          total: "84.04",
        },
        {
          parameter: multipleTitles,
          listTestId: "list-field",
          widgetText: "2 selections",
          value: ["Aerodynamic Concrete Bench", "Aerodynamic Bronze Hat"],
          total: "130.2",
        },
      ];
      for (const { parameter, listTestId, widgetText, value, total } of cases) {
        const dropdown = await openFilterWidget(parameter.name);
        expect(
          await within(dropdown).findByTestId(listTestId),
        ).toBeInTheDocument();
        expect(
          within(dropdown).getByText("Aerodynamic Concrete Bench"),
        ).toBeInTheDocument();
        expect(
          within(dropdown).queryByRole("combobox"),
        ).not.toBeInTheDocument();
        await userEvent.click(
          within(dropdown).getByText("Aerodynamic Concrete Bench"),
        );
        await userEvent.click(
          within(dropdown).getByText("Aerodynamic Bronze Hat"),
        );
        await userEvent.click(
          within(dropdown).getByRole("button", { name: "Add filter" }),
        );
        await expectDashcardTotal(total);
        expect(getLastSentValues()).toEqual({ [parameter.id]: value });
        expect(getFilterWidget(parameter.name)).toHaveTextContent(widgetText);
        await clearFilterWidget(parameter.name);
        await expectDashcardTotal(UNFILTERED_TOTAL);
      }
    });

    it("should drill to the question with a multi-value contains filter applied (metabase#42999)", async () => {
      const parameter = createMockParameter({
        id: "contains",
        name: "Contains",
        slug: "contains",
        type: "string/contains",
        sectionId: "string",
      });
      const { router, database } = await setup({
        parameters: [parameter],
        targets: { [parameter.id]: SOURCE_TARGET },
        paramFields: { [parameter.id]: [createPeopleSourceField()] },
        rules: [
          { parameterId: parameter.id, value: ["oo", "aa"], total: "148.23" },
        ],
      });

      await typeInComboboxAndAdd("oo,aa")(await openFilterWidget("Contains"));
      await expectDashcardTotal("148.23");

      await userEvent.click(
        within(screen.getByTestId("dashcard")).getByText(ORDERS_CARD.name),
      );

      expect(await screen.findByTestId("question-page")).toBeInTheDocument();
      const { pathname, hash } = router.location;
      expect(pathname).toBe("/question");
      const question = new Question(
        deserializeCardFromUrl(hash.replace(/^#/, "")),
        createMockMetadata({ databases: [database] }),
      );
      expect(question.card().original_card_id).toBe(ORDERS_CARD.id);
      const query = question.query();
      expect(
        Lib.filters(query, -1).map(
          (filter) => Lib.displayInfo(query, -1, filter).longDisplayName,
        ),
      ).toEqual(["User → Source contains 2 selections"]);
    });
  });
});
