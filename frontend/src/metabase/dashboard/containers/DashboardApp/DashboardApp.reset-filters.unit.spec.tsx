import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
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
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { Route } from "metabase/router";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  CardId,
  Dashboard,
  DashboardCard,
  Field,
  FieldId,
  Parameter,
  RowValue,
  TableId,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDashboardTab,
  createMockDataset,
  createMockDatasetData,
  createMockParameter,
  createMockParameterMapping,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

registerVisualizations();

const DASHBOARD_ID = 1;
const CARD_ID = 1;
const DASHCARD_ID = 1;

const NO_DEFAULT_NON_REQUIRED = "no default value, non-required";
const DEFAULT_NON_REQUIRED = "default value, non-required";
const DEFAULT_REQUIRED = "default value, required";

type Status = "chevron" | "reset" | "clear" | "none";

type FieldValueRow = [RowValue] | [RowValue, string];

type SetupOpts = {
  parameters: Parameter[];
  tableId: TableId;
  fieldId: FieldId;
  fieldValues?: FieldValueRow[];
  fieldOverrides?: Partial<Field>;
  /** Whether the values endpoint of the saved dashboard says that it truncated the values */
  hasMoreDashboardValues?: boolean;
};

function getRequestBody(body: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(String(body));
  return isObject(parsed) ? parsed : {};
}

function setupParameterValuesEndpoints({
  parameters,
  fieldId,
  fieldValues,
  hasMoreDashboardValues = false,
}: {
  parameters: Parameter[];
  fieldId: FieldId;
  fieldValues: FieldValueRow[];
  hasMoreDashboardValues?: boolean;
}) {
  const parameterIds = new Set(parameters.map(({ id }) => id));
  const isKnownParameter = (paramId: unknown) =>
    typeof paramId === "string" && parameterIds.has(paramId);
  const isAdhocRequestValid = (body: Record<string, unknown>) =>
    isObject(body.parameter) &&
    isKnownParameter(body.parameter.id) &&
    Array.isArray(body.field_ids) &&
    body.field_ids.length === 1 &&
    body.field_ids[0] === fieldId;
  const search = (query: string) =>
    fieldValues.filter((row) =>
      row.some((value) =>
        String(value).toLowerCase().includes(query.toLowerCase()),
      ),
    );
  const remap = (value: unknown) =>
    fieldValues.find(([rowValue]) => String(rowValue) === String(value)) ?? [
      value,
    ];

  // saved dashboard
  fetchMock.get(
    `express:/api/dashboard/${DASHBOARD_ID}/params/:paramId/values`,
    ({ expressParams }) => ({
      values: isKnownParameter(expressParams?.paramId) ? fieldValues : [],
      has_more_values: hasMoreDashboardValues,
    }),
  );
  fetchMock.get(
    `express:/api/dashboard/${DASHBOARD_ID}/params/:paramId/search/:query`,
    ({ expressParams }) => ({
      values: isKnownParameter(expressParams?.paramId)
        ? search(decodeURIComponent(expressParams?.query ?? ""))
        : [],
      has_more_values: false,
    }),
  );
  fetchMock.get(
    `express:/api/dashboard/${DASHBOARD_ID}/params/:paramId/remapping`,
    ({ expressParams, url }) => {
      const value = new URL(url).searchParams.get("value");
      return isKnownParameter(expressParams?.paramId) ? remap(value) : [value];
    },
  );

  // dashboard in the edit mode
  fetchMock.post("path:/api/dataset/parameter/values", ({ options }) => ({
    values: isAdhocRequestValid(getRequestBody(options.body))
      ? fieldValues
      : [],
    has_more_values: false,
  }));
  fetchMock.post(
    "express:/api/dataset/parameter/search/:query",
    ({ options, expressParams }) => ({
      values: isAdhocRequestValid(getRequestBody(options.body))
        ? search(decodeURIComponent(expressParams?.query ?? ""))
        : [],
      has_more_values: false,
    }),
  );
  fetchMock.post("path:/api/dataset/parameter/remapping", ({ options }) => {
    const body = getRequestBody(options.body);
    return isAdhocRequestValid(body) ? remap(body.value) : [body.value];
  });
}

const SAMPLE_DATABASE = createSampleDatabase();
const SAMPLE_FIELDS = (SAMPLE_DATABASE.tables ?? []).flatMap(
  (table) => table.fields ?? [],
);

function createTableCard({
  id,
  name,
  tableId,
  display = "table",
}: {
  id: CardId;
  name: string;
  tableId: TableId;
  display?: Card["display"];
}) {
  return createMockCard({
    id,
    name,
    display,
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: tableId } }],
      }),
    ),
  });
}

type DashcardQueryParameter = { id: string; value: unknown };

function getQueryParameters(body: unknown): DashcardQueryParameter[] {
  const { parameters } = getRequestBody(body);
  return Array.isArray(parameters)
    ? parameters.filter(
        (parameter): parameter is DashcardQueryParameter =>
          isObject(parameter) && typeof parameter.id === "string",
      )
    : [];
}

type RenderDashboardOpts = {
  dashboard: Dashboard;
  /** Answers the query of a dashcard from the parameters in its request */
  getDashcardRows?: (
    dashcard: DashboardCard,
    parameters: DashcardQueryParameter[],
  ) => RowValue[][];
  initialSearch?: string;
};

// Like the real API, a GET after a PUT returns the updated dashboard
function setupPersistedDashboardEndpoints(dashboard: Dashboard) {
  let persistedDashboard = dashboard;
  fetchMock.get(
    `path:/api/dashboard/${dashboard.id}`,
    () => persistedDashboard,
  );
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, ({ options }) => {
    // these tests don't change the cards, and the request has no hydrated cards
    const { dashcards: _dashcards, ...changes } = getRequestBody(options.body);
    persistedDashboard = { ...persistedDashboard, ...changes };
    return persistedDashboard;
  });
}

async function renderDashboard({
  dashboard,
  getDashcardRows = () => [],
  initialSearch = "",
}: RenderDashboardOpts) {
  const cards = dashboard.dashcards.flatMap((dashcard) =>
    isQuestionDashCard(dashcard) ? [dashcard.card] : [],
  );

  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([SAMPLE_DATABASE]);
  setupPersistedDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({
      databases: [SAMPLE_DATABASE],
      tables: SAMPLE_DATABASE.tables,
      fields: SAMPLE_FIELDS,
    }),
  );
  setupSubscriptionsEndpoint([]);
  dashboard.dashcards.filter(isQuestionDashCard).forEach((dashcard) => {
    fetchMock.post(
      `path:/api/dashboard/${dashboard.id}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query`,
      ({ options }) =>
        createMockDataset({
          data: createMockDatasetData({
            cols: [createMockColumn({ name: "value", display_name: "Value" })],
            rows: getDashcardRows(dashcard, getQueryParameters(options.body)),
          }),
        }),
    );
  });
  setupCollectionsEndpoints({ collections: [] });
  setupSearchEndpoints([]);
  setupCardsEndpoints(cards);
  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);

  const { router } = renderWithProviders(
    <Route path="/dashboard/:slug" element={<DashboardApp />} />,
    {
      initialRoute: `/dashboard/${dashboard.id}${initialSearch}`,
      withRouter: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [SAMPLE_DATABASE] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );

  await waitForDashboardToLoad();

  return { router: checkNotNull(router) };
}

async function setup({
  parameters,
  tableId,
  fieldId,
  fieldValues = [],
  fieldOverrides,
  hasMoreDashboardValues = false,
}: SetupOpts) {
  const field = {
    ...checkNotNull(SAMPLE_FIELDS.find(({ id }) => id === fieldId)),
    ...fieldOverrides,
  };
  const card = createTableCard({ id: CARD_ID, name: "Question", tableId });
  const dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    parameters,
    param_fields: Object.fromEntries(
      parameters.map((parameter) => [parameter.id, [field]]),
    ),
    dashcards: [
      createMockDashboardCard({
        id: DASHCARD_ID,
        dashboard_id: DASHBOARD_ID,
        card_id: card.id,
        card,
        parameter_mappings: parameters.map((parameter) =>
          createMockParameterMapping({
            parameter_id: parameter.id,
            card_id: card.id,
            target: ["dimension", ["field", fieldId, null]],
          }),
        ),
      }),
    ],
  });

  setupParameterValuesEndpoints({
    parameters,
    fieldId,
    fieldValues,
    hasMoreDashboardValues,
  });
  return renderDashboard({ dashboard });
}

function filter(label: string) {
  return screen.getByLabelText(label);
}

function getWidgetStatus(widget: HTMLElement): Status | undefined {
  const statuses = [
    within(widget).queryByRole("button", { name: "Clear" }) && "clear",
    within(widget).queryByRole("button", {
      name: "Reset filter to default state",
    }) && "reset",
    within(widget).queryByLabelText("chevrondown icon") && "chevron",
  ].filter((status): status is Status => Boolean(status));
  return statuses.length > 1 ? undefined : (statuses[0] ?? "none");
}

function getStatus(label: string) {
  return getWidgetStatus(filter(label));
}

async function openActionMenu() {
  await userEvent.click(
    screen.getByRole("button", { name: "Move, trash, and more…" }),
  );
  return screen.findByRole("menu");
}

async function expectResetAllFilters(shown: boolean) {
  const menu = await openActionMenu();
  expect(within(menu).getByText("Enter fullscreen")).toBeInTheDocument();
  if (shown) {
    expect(within(menu).getByText("Reset all filters")).toBeInTheDocument();
  } else {
    expect(
      within(menu).queryByText("Reset all filters"),
    ).not.toBeInTheDocument();
  }
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  );
}

async function resetAllFilters() {
  const menu = await openActionMenu();
  await userEvent.click(within(menu).getByText("Reset all filters"));
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  );
}

async function openPopover(label: string) {
  const widget = filter(label);
  // the default value widget in the sidebar is labelled by a wrapper around its trigger
  await userEvent.click(
    within(widget).queryByTestId("parameter-value-widget-target") ?? widget,
  );
  return screen.findByTestId("parameter-value-dropdown");
}

async function closePopover() {
  await waitFor(() =>
    expect(
      screen.queryByTestId("parameter-value-dropdown"),
    ).not.toBeInTheDocument(),
  );
}

async function submitPopover(popover: HTMLElement, name: RegExp | string) {
  await userEvent.click(within(popover).getByRole("button", { name }));
  await closePopover();
}

type ScenarioParameter = Pick<
  Parameter,
  "type" | "sectionId" | "isMultiSelect"
>;

type Scenario = {
  name: string;
  tableId: TableId;
  fieldId: FieldId;
  parameter: ScenarioParameter;
  defaultValue: Parameter["default"];
  defaultValueFormatted: string;
  otherValueFormatted: string;
  fieldValues?: FieldValueRow[];
  fieldOverrides?: Partial<Field>;
  hasMoreDashboardValues?: boolean;
  /** Sets the other value on a filter without a value */
  setValue: (label: string) => Promise<void>;
  /** Replaces the value of a filter with the other value */
  updateValue?: (label: string) => Promise<void>;
  /** For values whose formatted text does not tell them apart */
  assertValue?: (label: string, value: "default" | "other") => Promise<void>;
  /** Sets or replaces the default value in the parameter sidebar with the other value */
  setDefaultValue?: (label: string) => Promise<void>;
};

function createParameters({ parameter, defaultValue }: Scenario) {
  return [
    createMockParameter({
      ...parameter,
      id: "fed1b910",
      name: NO_DEFAULT_NON_REQUIRED,
      slug: "no-default-value",
    }),
    createMockParameter({
      ...parameter,
      id: "75d67d30",
      name: DEFAULT_NON_REQUIRED,
      slug: "default-value",
      default: defaultValue,
    }),
    createMockParameter({
      ...parameter,
      id: "60f12ac0",
      name: DEFAULT_REQUIRED,
      slug: "default-value-required",
      default: defaultValue,
      required: true,
    }),
  ];
}

async function expectValue(
  scenario: Scenario,
  label: string,
  value: "default" | "other",
) {
  await waitFor(() =>
    expect(filter(label)).toHaveTextContent(
      value === "default"
        ? scenario.defaultValueFormatted
        : scenario.otherValueFormatted,
    ),
  );
  await scenario.assertValue?.(label, value);
}

async function expectEmpty(label: string) {
  await waitFor(() => expect(filter(label)).toHaveTextContent(label));
}

async function clickClear(label: string) {
  await userEvent.click(
    within(filter(label)).getByRole("button", { name: "Clear" }),
  );
}

async function clickReset(label: string) {
  await userEvent.click(
    within(filter(label)).getByRole("button", {
      name: "Reset filter to default state",
    }),
  );
}

async function assertDashboardParameters(scenario: Scenario) {
  const { setValue, updateValue = setValue } = scenario;

  // no default value, non-required, no current value
  expect(getStatus(NO_DEFAULT_NON_REQUIRED)).toBe("chevron");
  await expectResetAllFilters(false);

  // no default value, non-required, has current value
  await setValue(NO_DEFAULT_NON_REQUIRED);
  await expectValue(scenario, NO_DEFAULT_NON_REQUIRED, "other");
  expect(getStatus(NO_DEFAULT_NON_REQUIRED)).toBe("clear");
  await expectResetAllFilters(true);

  await resetAllFilters();
  await expectEmpty(NO_DEFAULT_NON_REQUIRED);
  expect(getStatus(NO_DEFAULT_NON_REQUIRED)).toBe("chevron");
  await expectResetAllFilters(false);

  await setValue(NO_DEFAULT_NON_REQUIRED);
  await expectValue(scenario, NO_DEFAULT_NON_REQUIRED, "other");
  await clickClear(NO_DEFAULT_NON_REQUIRED);
  await expectEmpty(NO_DEFAULT_NON_REQUIRED);
  expect(getStatus(NO_DEFAULT_NON_REQUIRED)).toBe("chevron");
  await expectResetAllFilters(false);

  // has default value, non-required, current value same as default
  expect(getStatus(DEFAULT_NON_REQUIRED)).toBe("clear");
  await expectValue(scenario, DEFAULT_NON_REQUIRED, "default");
  await expectResetAllFilters(false);

  await clickClear(DEFAULT_NON_REQUIRED);
  await expectEmpty(DEFAULT_NON_REQUIRED);
  expect(getStatus(DEFAULT_NON_REQUIRED)).toBe("reset");
  await expectResetAllFilters(true);

  await resetAllFilters();
  await expectValue(scenario, DEFAULT_NON_REQUIRED, "default");
  expect(getStatus(DEFAULT_NON_REQUIRED)).toBe("clear");

  // has default value, non-required, no current value
  await clickClear(DEFAULT_NON_REQUIRED);
  await expectEmpty(DEFAULT_NON_REQUIRED);
  expect(getStatus(DEFAULT_NON_REQUIRED)).toBe("reset");
  await expectResetAllFilters(true);

  await clickReset(DEFAULT_NON_REQUIRED);
  await expectValue(scenario, DEFAULT_NON_REQUIRED, "default");
  expect(getStatus(DEFAULT_NON_REQUIRED)).toBe("clear");
  await expectResetAllFilters(false);

  // has default value, non-required, current value different than default
  await updateValue(DEFAULT_NON_REQUIRED);
  await expectValue(scenario, DEFAULT_NON_REQUIRED, "other");
  expect(getStatus(DEFAULT_NON_REQUIRED)).toBe("reset");
  await expectResetAllFilters(true);

  await resetAllFilters();
  await expectValue(scenario, DEFAULT_NON_REQUIRED, "default");
  expect(getStatus(DEFAULT_NON_REQUIRED)).toBe("clear");
  await expectResetAllFilters(false);

  await updateValue(DEFAULT_NON_REQUIRED);
  await expectValue(scenario, DEFAULT_NON_REQUIRED, "other");
  await clickReset(DEFAULT_NON_REQUIRED);
  await expectValue(scenario, DEFAULT_NON_REQUIRED, "default");
  expect(getStatus(DEFAULT_NON_REQUIRED)).toBe("clear");
  await expectResetAllFilters(false);

  // has default value, required, value same as default
  await expectValue(scenario, DEFAULT_REQUIRED, "default");
  expect(getStatus(DEFAULT_REQUIRED)).toBe("none");
  await expectResetAllFilters(false);

  // has default value, required, current value different than default
  await updateValue(DEFAULT_REQUIRED);
  await expectValue(scenario, DEFAULT_REQUIRED, "other");
  expect(getStatus(DEFAULT_REQUIRED)).toBe("reset");
  await expectResetAllFilters(true);

  await resetAllFilters();
  await expectValue(scenario, DEFAULT_REQUIRED, "default");
  expect(getStatus(DEFAULT_REQUIRED)).toBe("none");
  await expectResetAllFilters(false);

  await updateValue(DEFAULT_REQUIRED);
  await expectValue(scenario, DEFAULT_REQUIRED, "other");
  await clickReset(DEFAULT_REQUIRED);
  await expectValue(scenario, DEFAULT_REQUIRED, "default");
  expect(getStatus(DEFAULT_REQUIRED)).toBe("none");
  await expectResetAllFilters(false);
}

async function startEditing() {
  await userEvent.click(screen.getByLabelText("Edit dashboard"));
}

async function editFilter(label: string) {
  await userEvent.click(
    within(
      screen.getByTestId("edit-dashboard-parameters-widget-container"),
    ).getByText(label),
  );
  await screen.findByTestId("dashboard-parameter-sidebar");
}

function sidebar() {
  return within(screen.getByTestId("dashboard-parameter-sidebar"));
}

function defaultValueWidget(label = "Default value") {
  return sidebar().getByLabelText(label);
}

function getDefaultValueStatus(label = "Default value") {
  return getWidgetStatus(defaultValueWidget(label));
}

async function clearDefaultValue() {
  await userEvent.click(
    within(defaultValueWidget()).getByRole("button", { name: "Clear" }),
  );
}

async function assertParameterSidebarDefaultValue(scenario: Scenario) {
  const { setValue, updateValue = setValue } = scenario;
  const setDefaultValue = scenario.setDefaultValue ?? setValue;
  const updateDefaultValue = scenario.setDefaultValue ?? updateValue;

  await startEditing();

  await editFilter(NO_DEFAULT_NON_REQUIRED);
  expect(defaultValueWidget()).toHaveTextContent("No default");
  expect(getDefaultValueStatus()).toBe("chevron");

  await setDefaultValue("Default value");
  await waitFor(() =>
    expect(defaultValueWidget()).toHaveTextContent(
      scenario.otherValueFormatted,
    ),
  );
  expect(getDefaultValueStatus()).toBe("clear");

  await clearDefaultValue();
  expect(defaultValueWidget()).toHaveTextContent("No default");
  expect(getDefaultValueStatus()).toBe("chevron");

  await editFilter(DEFAULT_NON_REQUIRED);
  await waitFor(() =>
    expect(defaultValueWidget()).toHaveTextContent(
      scenario.defaultValueFormatted,
    ),
  );
  expect(getDefaultValueStatus()).toBe("clear");

  await clearDefaultValue();
  expect(defaultValueWidget()).toHaveTextContent("No default");
  expect(getDefaultValueStatus()).toBe("chevron");

  await setDefaultValue("Default value");
  await waitFor(() =>
    expect(defaultValueWidget()).toHaveTextContent(
      scenario.otherValueFormatted,
    ),
  );
  expect(getDefaultValueStatus()).toBe("clear");

  await editFilter(DEFAULT_REQUIRED);
  await waitFor(() =>
    expect(defaultValueWidget()).toHaveTextContent(
      scenario.defaultValueFormatted,
    ),
  );
  expect(getDefaultValueStatus()).toBe("clear");

  await clearDefaultValue();
  expect(defaultValueWidget("Default value (required)")).toHaveTextContent(
    "No default",
  );
  expect(getDefaultValueStatus("Default value (required)")).toBe("chevron");

  await updateDefaultValue("Default value (required)");
  await waitFor(() =>
    expect(defaultValueWidget()).toHaveTextContent(
      scenario.otherValueFormatted,
    ),
  );
  expect(getDefaultValueStatus()).toBe("clear");
}

const PRODUCT_CATEGORY_VALUES: FieldValueRow[] = [
  ["Doohickey"],
  ["Gadget"],
  ["Gizmo"],
  ["Widget"],
];
const PEOPLE_CITY_VALUES: FieldValueRow[] = [
  ["Bassett"],
  ["Dike"],
  ["Thomson"],
];
const PEOPLE_ID_VALUES: FieldValueRow[] = [
  [1, "Hudson Borer"],
  [2, "Domenica Williamson"],
  [3, "Lina Heaney"],
];

type Popover = HTMLElement;

async function replaceText(input: HTMLElement, text: string) {
  await userEvent.clear(input);
  await userEvent.type(input, text);
  await userEvent.tab();
}

async function addTokens(popover: Popover, text: string) {
  const input = await within(popover).findByTestId("token-field");
  await userEvent.type(input, text);
  await userEvent.tab();
}

async function searchList(popover: Popover, text: string) {
  await userEvent.type(
    await within(popover).findByPlaceholderText("Search the list"),
    text,
  );
}

async function selectListItems(popover: Popover, items: string[]) {
  for (const item of items) {
    await userEvent.click(await within(popover).findByText(item));
  }
}

const SUBMIT_BUTTON = /(Add|Update) filter/;

const SCENARIOS: Scenario[] = [
  {
    name: "temporal unit parameters",
    tableId: ORDERS_ID,
    fieldId: ORDERS.CREATED_AT,
    parameter: { type: "temporal-unit", sectionId: "temporal-unit" },
    defaultValue: "year",
    defaultValueFormatted: "Year",
    otherValueFormatted: "Month",
    setValue: async (label) => {
      const popover = await openPopover(label);
      await userEvent.click(within(popover).getByText("Month"));
      await closePopover();
    },
  },
  {
    name: "time parameters",
    tableId: ORDERS_ID,
    fieldId: ORDERS.CREATED_AT,
    parameter: { type: "date/single", sectionId: "date" },
    defaultValue: "2027-01-01",
    defaultValueFormatted: "January 1, 2027",
    otherValueFormatted: "January 1, 2020",
    setValue: async (label) => {
      const popover = await openPopover(label);
      await replaceText(within(popover).getByRole("textbox"), "01/01/2020");
      await submitPopover(popover, SUBMIT_BUTTON);
    },
  },
  {
    name: "location parameters - single value",
    tableId: PEOPLE_ID,
    fieldId: PEOPLE.CITY,
    parameter: {
      type: "string/=",
      sectionId: "location",
      isMultiSelect: false,
    },
    defaultValue: ["Bassett"],
    defaultValueFormatted: "Bassett",
    otherValueFormatted: "Dike",
    fieldValues: PEOPLE_CITY_VALUES,
    // the dashboard gets too many cities to list them, the sidebar lists them
    fieldOverrides: { has_field_values: "list" },
    hasMoreDashboardValues: true,
    setValue: async (label) => {
      const popover = await openPopover(label);
      await addTokens(popover, "{backspace}Dike");
      await submitPopover(popover, SUBMIT_BUTTON);
    },
    setDefaultValue: async (label) => {
      const popover = await openPopover(label);
      await searchList(popover, "Dike");
      // the search leaves only the matching city
      await waitFor(() =>
        expect(within(popover).getAllByRole("listitem")).toHaveLength(1),
      );
      await userEvent.click(
        within(within(popover).getByRole("listitem")).getByText("Dike"),
      );
      await submitPopover(popover, SUBMIT_BUTTON);
    },
  },
  {
    name: "location parameters - multiple values",
    tableId: PEOPLE_ID,
    fieldId: PEOPLE.CITY,
    parameter: { type: "string/=", sectionId: "location" },
    defaultValue: ["Bassett", "Thomson"],
    defaultValueFormatted: "2 selections",
    otherValueFormatted: "Dike",
    fieldValues: PEOPLE_CITY_VALUES,
    // the dashboard gets too many cities to list them, the sidebar lists them
    fieldOverrides: { has_field_values: "list" },
    hasMoreDashboardValues: true,
    setValue: async (label) => {
      const popover = await openPopover(label);
      await addTokens(popover, "{backspace}{backspace}Dike");
      await submitPopover(popover, SUBMIT_BUTTON);
    },
    setDefaultValue: async (label) => {
      const popover = await openPopover(label);
      await searchList(popover, "Dike");
      // the search leaves "Select all" and the matching city
      await waitFor(() =>
        expect(within(popover).getAllByRole("checkbox")).toHaveLength(2),
      );
      await userEvent.click(
        within(popover).getByRole("checkbox", { name: "Dike" }),
      );
      await submitPopover(popover, SUBMIT_BUTTON);
    },
  },
  {
    name: "id parameters - single value",
    tableId: PEOPLE_ID,
    fieldId: PEOPLE.ID,
    parameter: { type: "id", sectionId: "id", isMultiSelect: false },
    defaultValue: ["1"],
    defaultValueFormatted: "Hudson Borer - 1",
    otherValueFormatted: "Domenica Williamson - 2",
    fieldValues: PEOPLE_ID_VALUES,
    setValue: async (label) => {
      const popover = await openPopover(label);
      await addTokens(popover, "{backspace}2");
      await submitPopover(popover, SUBMIT_BUTTON);
    },
  },
  {
    name: "id parameters - multiple values",
    tableId: PEOPLE_ID,
    fieldId: PEOPLE.ID,
    parameter: { type: "id", sectionId: "id" },
    defaultValue: ["1", "2"],
    defaultValueFormatted: "2 selections",
    otherValueFormatted: "Lina Heaney - 3",
    fieldValues: PEOPLE_ID_VALUES,
    setValue: async (label) => {
      const popover = await openPopover(label);
      await addTokens(popover, "{backspace}{backspace}3");
      await submitPopover(popover, SUBMIT_BUTTON);
    },
  },
  {
    name: "number parameters - single value",
    tableId: PEOPLE_ID,
    fieldId: PEOPLE.ID,
    parameter: { type: "number/>=", sectionId: "number" },
    defaultValue: [1],
    defaultValueFormatted: "Hudson Borer - 1",
    otherValueFormatted: "Domenica Williamson - 2",
    fieldValues: PEOPLE_ID_VALUES,
    setValue: async (label) => {
      const popover = await openPopover(label);
      await replaceText(within(popover).getByRole("textbox"), "2");
      await submitPopover(popover, SUBMIT_BUTTON);
    },
  },
  {
    name: "number parameters - range",
    tableId: PEOPLE_ID,
    fieldId: PEOPLE.ID,
    parameter: { type: "number/between", sectionId: "number" },
    defaultValue: [1, 2],
    defaultValueFormatted: "2 selections",
    otherValueFormatted: "2 selections",
    fieldValues: PEOPLE_ID_VALUES,
    setValue: async (label) => {
      const popover = await openPopover(label);
      const [min, max] = within(popover).getAllByRole("textbox");
      await replaceText(min, "3");
      await replaceText(max, "4");
      await submitPopover(popover, SUBMIT_BUTTON);
    },
    assertValue: async (label, value) => {
      const popover = await openPopover(label);
      const [min, max] = within(popover).getAllByRole("textbox");
      expect(min).toHaveValue(value === "default" ? "1" : "3");
      expect(max).toHaveValue(value === "default" ? "2" : "4");
      await userEvent.keyboard("{Escape}");
      await closePopover();
    },
  },
  {
    name: "text parameters - single value",
    tableId: PRODUCTS_ID,
    fieldId: PRODUCTS.CATEGORY,
    parameter: { type: "string/=", sectionId: "string", isMultiSelect: false },
    defaultValue: ["Gizmo"],
    defaultValueFormatted: "Gizmo",
    otherValueFormatted: "Gadget",
    fieldValues: PRODUCT_CATEGORY_VALUES,
    setValue: async (label) => {
      const popover = await openPopover(label);
      await selectListItems(popover, ["Gadget"]);
      await submitPopover(popover, SUBMIT_BUTTON);
    },
  },
  {
    name: "text parameters - multiple values",
    tableId: PRODUCTS_ID,
    fieldId: PRODUCTS.CATEGORY,
    parameter: { type: "string/=", sectionId: "string" },
    defaultValue: ["Gizmo", "Gadget"],
    defaultValueFormatted: "2 selections",
    otherValueFormatted: "3 selections",
    fieldValues: PRODUCT_CATEGORY_VALUES,
    setValue: async (label) => {
      const popover = await openPopover(label);
      await selectListItems(popover, ["Doohickey", "Gizmo", "Widget"]);
      await submitPopover(popover, SUBMIT_BUTTON);
    },
    updateValue: async (label) => {
      const popover = await openPopover(label);
      await selectListItems(popover, ["Select all", "Select all"]);
      await selectListItems(popover, ["Doohickey", "Gizmo", "Widget"]);
      await submitPopover(popover, SUBMIT_BUTTON);
    },
  },
];

describe("DashboardApp > reset and clear filters", () => {
  describe.each(SCENARIOS)("$name", (scenario) => {
    it("should clear and reset the filter values on the dashboard", async () => {
      await setup({
        parameters: createParameters(scenario),
        tableId: scenario.tableId,
        fieldId: scenario.fieldId,
        fieldValues: scenario.fieldValues,
        fieldOverrides: scenario.fieldOverrides,
        hasMoreDashboardValues: scenario.hasMoreDashboardValues,
      });
      await assertDashboardParameters(scenario);
    });

    it("should clear and set the default value in the parameter sidebar", async () => {
      await setup({
        parameters: createParameters(scenario),
        tableId: scenario.tableId,
        fieldId: scenario.fieldId,
        fieldValues: scenario.fieldValues,
        fieldOverrides: scenario.fieldOverrides,
        hasMoreDashboardValues: scenario.hasMoreDashboardValues,
      });
      await assertParameterSidebarDefaultValue(scenario);
    });
  });

  it("should set a required multi-value filter to its default value after deselecting all values", async () => {
    const scenario = checkNotNull(
      SCENARIOS.find(
        ({ name }) => name === "text parameters - multiple values",
      ),
    );
    await setup({
      parameters: createParameters(scenario),
      tableId: scenario.tableId,
      fieldId: scenario.fieldId,
      fieldValues: scenario.fieldValues,
      fieldOverrides: scenario.fieldOverrides,
      hasMoreDashboardValues: scenario.hasMoreDashboardValues,
    });

    let popover = await openPopover(DEFAULT_REQUIRED);
    await selectListItems(popover, ["Gizmo"]);
    await submitPopover(popover, "Update filter");
    await waitFor(() =>
      expect(filter(DEFAULT_REQUIRED)).toHaveTextContent("Gadget"),
    );
    expect(getStatus(DEFAULT_REQUIRED)).toBe("reset");

    popover = await openPopover(DEFAULT_REQUIRED);
    await selectListItems(popover, ["Select all", "Select all"]);
    await submitPopover(popover, "Set to default");
    await waitFor(() =>
      expect(filter(DEFAULT_REQUIRED)).toHaveTextContent("2 selections"),
    );
    expect(getStatus(DEFAULT_REQUIRED)).toBe("none");
  });

  it("should update the value of a filter whose popover is open when it is reset to the default value (metabase#46177)", async () => {
    const parameter = createMockParameter({
      id: "10c0d4bc",
      name: "Number filter",
      slug: "number_filter",
      type: "number/=",
      sectionId: "number",
      default: 2.9,
    });
    await setup({
      parameters: [parameter],
      tableId: ORDERS_ID,
      fieldId: ORDERS.TAX,
    });

    const popover = await openPopover(parameter.name);
    await addTokens(popover, "{backspace}3");
    await submitPopover(popover, "Update filter");
    await waitFor(() => expect(filter(parameter.name)).toHaveTextContent("3"));

    await openPopover(parameter.name);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await clickReset(parameter.name);
    await waitFor(() =>
      expect(filter(parameter.name)).toHaveTextContent("2.9"),
    );
    await closePopover();
  });

  describe("reset all filters across tabs", () => {
    const TAB_A = createMockDashboardTab({ id: 1, name: "Tab A" });
    const TAB_B = createMockDashboardTab({ id: 2, name: "Tab B" });
    const ORDERS_CARD = createTableCard({
      id: 1,
      name: "Orders",
      tableId: ORDERS_ID,
      display: "scalar",
    });
    const ORDERS_COUNT_CARD = createTableCard({
      id: 2,
      name: "Orders, Count",
      tableId: ORDERS_ID,
      display: "scalar",
    });
    const PARAMETER_A = createMockParameter({
      id: "fed1b910",
      name: "Parameter A",
      slug: "parameter-a",
      type: "date/single",
      sectionId: "date",
    });
    const PARAMETER_B = createMockParameter({
      id: "fed1b911",
      name: "Parameter B",
      slug: "parameter-b",
      type: "date/single",
      sectionId: "date",
    });
    const DEFAULT_DATE = "2026-01-05";

    // The value that each card shows for the date its filter sends
    const ROWS_BY_DATE: Record<CardId, Record<string, RowValue>> = {
      [ORDERS_CARD.id]: {
        none: 37.65,
        [DEFAULT_DATE]: 73.99,
        "2027-01-01": 116.01,
      },
      [ORDERS_COUNT_CARD.id]: {
        none: 18760,
        [DEFAULT_DATE]: 4,
        "2026-01-01": 5,
      },
    };

    type TabsSetupOpts = {
      autoApplyFilters: boolean;
      defaultValue?: string;
    };

    async function setupTabs({
      autoApplyFilters,
      defaultValue,
    }: TabsSetupOpts) {
      const parameterA = { ...PARAMETER_A, default: defaultValue };
      const parameterB = { ...PARAMETER_B, default: defaultValue };
      const dashcards = [
        { id: 1, tab: TAB_A, card: ORDERS_CARD, parameter: parameterA },
        { id: 2, tab: TAB_B, card: ORDERS_COUNT_CARD, parameter: parameterB },
      ].map(({ id, tab, card, parameter }) =>
        createMockDashboardCard({
          id,
          dashboard_id: DASHBOARD_ID,
          dashboard_tab_id: tab.id,
          card_id: card.id,
          card,
          size_x: 10,
          size_y: 4,
          parameter_mappings: [
            createMockParameterMapping({
              parameter_id: parameter.id,
              card_id: card.id,
              target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
            }),
          ],
        }),
      );
      const dashboard = createMockDashboard({
        id: DASHBOARD_ID,
        tabs: [TAB_A, TAB_B],
        parameters: [parameterA, parameterB],
        auto_apply_filters: autoApplyFilters,
        dashcards,
      });

      return renderDashboard({
        dashboard,
        getDashcardRows: (dashcard, parameters) => {
          const mappedParameterId =
            dashcard.parameter_mappings?.[0]?.parameter_id;
          const unmappedParameters = parameters.filter(
            ({ id }) => id !== mappedParameterId,
          );
          if (unmappedParameters.length > 0) {
            return [];
          }
          const value = parameters.find(
            ({ id }) => id === mappedParameterId,
          )?.value;
          const row =
            ROWS_BY_DATE[dashcard.card_id ?? -1]?.[
              value == null ? "none" : String(value)
            ];
          return row == null ? [] : [[row]];
        },
      });
    }

    function getDashcard() {
      return screen.getByTestId("dashcard");
    }

    async function expectDashcardValue(value: string, notValue?: string) {
      expect(await within(getDashcard()).findByText(value)).toBeInTheDocument();
      if (notValue) {
        expect(
          within(getDashcard()).queryByText(notValue),
        ).not.toBeInTheDocument();
      }
    }

    async function setDateFilter(label: string, date: string) {
      const popover = await openPopover(label);
      await replaceText(within(popover).getByRole("textbox"), date);
      await submitPopover(popover, SUBMIT_BUTTON);
    }

    async function applyFilters(autoApplyFilters: boolean) {
      if (!autoApplyFilters) {
        await userEvent.click(
          await screen.findByRole("button", { name: "Apply" }),
        );
      }
    }

    async function selectTab(name: string) {
      await userEvent.click(screen.getByRole("tab", { name }));
    }

    function getLastDashcardQueryParameters(dashcardId: number) {
      const call = checkNotNull(
        fetchMock.callHistory.lastCall(
          new RegExp(`/api/dashboard/${DASHBOARD_ID}/dashcard/${dashcardId}/`),
        ),
      );
      return getQueryParameters(call.options.body).map(({ id, value }) => ({
        id,
        value,
      }));
    }

    describe.each([true, false])(
      "with auto-apply filters %s",
      (autoApplyFilters) => {
        it("should reset the filters of all tabs to empty values", async () => {
          await setupTabs({ autoApplyFilters });

          await expectResetAllFilters(false);
          expect(filter(PARAMETER_A.name)).toHaveTextContent(PARAMETER_A.name);
          await expectDashcardValue("37.65", "116.01");

          await setDateFilter(PARAMETER_A.name, "01/01/2027");
          expect(filter(PARAMETER_A.name)).toHaveTextContent("January 1, 2027");
          await applyFilters(autoApplyFilters);
          await expectResetAllFilters(true);
          await expectDashcardValue("116.01", "37.65");
          expect(getLastDashcardQueryParameters(1)).toEqual([
            { id: PARAMETER_A.id, value: "2027-01-01" },
          ]);

          await selectTab(TAB_B.name);
          await expectResetAllFilters(true);
          expect(filter(PARAMETER_B.name)).toHaveTextContent(PARAMETER_B.name);
          await expectDashcardValue("18760");

          await setDateFilter(PARAMETER_B.name, "01/01/2026");
          await applyFilters(autoApplyFilters);
          await expectResetAllFilters(true);
          expect(filter(PARAMETER_B.name)).toHaveTextContent("January 1, 2026");
          await expectDashcardValue("5", "18760");
          expect(getLastDashcardQueryParameters(2)).toEqual([
            { id: PARAMETER_B.id, value: "2026-01-01" },
          ]);

          await resetAllFilters();
          await expectResetAllFilters(false);
          expect(filter(PARAMETER_B.name)).toHaveTextContent(PARAMETER_B.name);
          await expectDashcardValue("18760", "5");
          expect(getLastDashcardQueryParameters(2)).toEqual([
            { id: PARAMETER_B.id, value: null },
          ]);

          await selectTab(TAB_A.name);
          await expectResetAllFilters(false);
          expect(filter(PARAMETER_A.name)).toHaveTextContent(PARAMETER_A.name);
          await expectDashcardValue("37.65", "116.01");
          expect(getLastDashcardQueryParameters(1)).toEqual([
            { id: PARAMETER_A.id, value: null },
          ]);
        });

        it("should reset the filters of all tabs to their default values", async () => {
          await setupTabs({ autoApplyFilters, defaultValue: DEFAULT_DATE });

          await expectResetAllFilters(false);
          expect(filter(PARAMETER_A.name)).toHaveTextContent("January 5, 2026");
          await expectDashcardValue("73.99", "116.01");

          await setDateFilter(PARAMETER_A.name, "01/01/2027");
          expect(filter(PARAMETER_A.name)).toHaveTextContent("January 1, 2027");
          await applyFilters(autoApplyFilters);
          await expectResetAllFilters(true);
          await expectDashcardValue("116.01", "73.99");

          await selectTab(TAB_B.name);
          await expectResetAllFilters(true);
          expect(filter(PARAMETER_B.name)).toHaveTextContent("January 5, 2026");
          await expectDashcardValue("4");

          await setDateFilter(PARAMETER_B.name, "01/01/2026");
          await applyFilters(autoApplyFilters);
          await expectResetAllFilters(true);
          expect(filter(PARAMETER_B.name)).toHaveTextContent("January 1, 2026");
          await expectDashcardValue("5", "4");

          await resetAllFilters();
          await expectResetAllFilters(false);
          expect(filter(PARAMETER_B.name)).toHaveTextContent("January 5, 2026");
          await expectDashcardValue("4", "5");
          expect(getLastDashcardQueryParameters(2)).toEqual([
            { id: PARAMETER_B.id, value: DEFAULT_DATE },
          ]);

          await selectTab(TAB_A.name);
          await expectResetAllFilters(false);
          expect(filter(PARAMETER_A.name)).toHaveTextContent("January 5, 2026");
          await expectDashcardValue("73.99", "116.01");
          expect(getLastDashcardQueryParameters(1)).toEqual([
            { id: PARAMETER_A.id, value: DEFAULT_DATE },
          ]);
        });
      },
    );
  });

  describe("editing the default value", () => {
    const FILTER_ONE = createMockParameter({
      id: "904aa8b7",
      name: "Filter One",
      slug: "filter_one",
      type: "string/=",
      sectionId: "string",
    });
    const FILTER_TWO = createMockParameter({
      id: "904aa8b8",
      name: "Filter Two",
      slug: "filter_two",
      type: "string/=",
      sectionId: "string",
      default: "Bar",
    });

    async function setupDefaults() {
      const card = createTableCard({
        id: CARD_ID,
        name: "Return input value",
        tableId: PRODUCTS_ID,
        display: "scalar",
      });
      const getField = (fieldId: FieldId) =>
        checkNotNull(SAMPLE_FIELDS.find(({ id }) => id === fieldId));
      const parameters = [FILTER_ONE, FILTER_TWO];
      setupParameterValuesEndpoints({
        parameters,
        fieldId: PRODUCTS.CATEGORY,
        fieldValues: [],
      });

      return renderDashboard({
        initialSearch: "?filter_one=&filter_two=Bar",
        dashboard: createMockDashboard({
          id: DASHBOARD_ID,
          name: "Filters Dashboard",
          parameters,
          param_fields: {
            [FILTER_ONE.id]: [getField(PRODUCTS.CATEGORY)],
            [FILTER_TWO.id]: [getField(PRODUCTS.TITLE)],
          },
          dashcards: [
            createMockDashboardCard({
              id: DASHCARD_ID,
              dashboard_id: DASHBOARD_ID,
              card_id: card.id,
              card,
              parameter_mappings: [
                createMockParameterMapping({
                  parameter_id: FILTER_ONE.id,
                  card_id: card.id,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                }),
                createMockParameterMapping({
                  parameter_id: FILTER_TWO.id,
                  card_id: card.id,
                  target: ["dimension", ["field", PRODUCTS.TITLE, null]],
                }),
              ],
            }),
          ],
        }),
      });
    }

    async function setInputBoxDefaultValue(value: string) {
      await userEvent.click(
        sidebar().getByRole("radio", { name: "Input box" }),
      );
      const popover = await openPopover("Default value");
      await userEvent.type(
        await within(popover).findByPlaceholderText("Enter some text"),
        value,
      );
      await submitPopover(popover, "Add filter");
    }

    async function saveDashboard() {
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(screen.queryByTestId("edit-bar")).not.toBeInTheDocument(),
      );
    }

    async function getSavedParameterDefaults() {
      const call = await waitFor(() =>
        checkNotNull(
          fetchMock.callHistory.lastCall(
            `path:/api/dashboard/${DASHBOARD_ID}`,
            {
              method: "PUT",
            },
          ),
        ),
      );
      const { parameters } = getRequestBody(call.options.body);
      return Array.isArray(parameters)
        ? parameters.filter(isObject).map(({ id, default: value }) => ({
            id,
            default: value,
          }))
        : [];
    }

    it("should reset the value of a filter when its default value is edited, and leave the other filters alone", async () => {
      const { router } = await setupDefaults();

      expect(filter(FILTER_ONE.name)).toHaveTextContent("Filter One");
      expect(filter(FILTER_TWO.name)).toHaveTextContent("Bar");
      expect(router.location.search).toBe("?filter_one=&filter_two=Bar");

      await clickClear(FILTER_TWO.name);
      await waitFor(() =>
        expect(router.location.search).toBe("?filter_one=&filter_two="),
      );

      // replacing the default value of Filter Two updates its value in the URL
      await startEditing();
      await editFilter(FILTER_TWO.name);
      await clearDefaultValue();
      await setInputBoxDefaultValue("Foo");
      await waitFor(() =>
        expect(router.location.search).toBe("?filter_one=&filter_two=Foo"),
      );

      await saveDashboard();
      expect(await getSavedParameterDefaults()).toEqual([
        { id: FILTER_ONE.id, default: undefined },
        { id: FILTER_TWO.id, default: ["Foo"] },
      ]);
      expect(router.location.search).toBe("?filter_one=&filter_two=Foo");
      expect(filter(FILTER_ONE.name)).toHaveTextContent("Filter One");
      expect(filter(FILTER_TWO.name)).toHaveTextContent("Foo");

      // setting the default value of Filter One leaves Filter Two alone
      await startEditing();
      await editFilter(FILTER_ONE.name);
      await setInputBoxDefaultValue("Baz");
      await waitFor(() =>
        expect(router.location.search).toBe("?filter_one=Baz&filter_two=Foo"),
      );

      await saveDashboard();
      expect(await getSavedParameterDefaults()).toEqual([
        { id: FILTER_ONE.id, default: ["Baz"] },
        { id: FILTER_TWO.id, default: ["Foo"] },
      ]);
      expect(router.location.search).toBe("?filter_one=Baz&filter_two=Foo");
      expect(filter(FILTER_ONE.name)).toHaveTextContent("Baz");
      expect(filter(FILTER_TWO.name)).toHaveTextContent("Foo");
    });
  });
});
