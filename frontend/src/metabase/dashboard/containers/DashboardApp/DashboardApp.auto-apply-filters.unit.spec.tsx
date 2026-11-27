import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCollectionsEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  setupNotificationChannelsEndpoints,
  setupSubscriptionsEndpoint,
} from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import {
  createMockEmbedOptions,
  createMockEmbedState,
} from "__support__/state/embed";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForDashboardToLoad,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Dashboard,
  Parameter,
  ParameterTarget,
  VirtualDashCardParameterMapping,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDataset,
  createMockNumericColumn,
  createMockParameter,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  createProductsCategoryField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

registerVisualizations();

const DASHBOARD_ID = 1;
const DATABASE = createSampleDatabase();

const FILTER = createMockParameter({
  id: "2a12e66c",
  name: "Category",
  slug: "category",
  type: "string/=",
  sectionId: "string",
});

const FILTER_WITH_DEFAULT_VALUE = createMockParameter({
  id: "e2809ab2",
  name: "Category with default value",
  slug: "category_with_default_value",
  type: "string/=",
  sectionId: "string",
  default: ["Gadget"],
});

const CARD = createMockCard({
  id: 2,
  name: "Products count",
  display: "scalar",
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  }),
});

const CATEGORY_TARGET: ParameterTarget = [
  "dimension",
  ["field", PRODUCTS.CATEGORY, null],
];

function createDashcard(
  parameterMappings: readonly VirtualDashCardParameterMapping[],
) {
  return createMockDashboardCard({
    id: 3,
    dashboard_id: DASHBOARD_ID,
    card_id: CARD.id,
    card: CARD,
    size_x: 8,
    size_y: 4,
    parameter_mappings: parameterMappings.map(({ parameter_id, target }) => ({
      parameter_id,
      card_id: CARD.id,
      target,
    })),
  });
}

const DASHCARD_QUERY_URL = `path:/api/dashboard/${DASHBOARD_ID}/dashcard/3/card/${CARD.id}/query`;

// Product counts of the sample database by category
const COUNTS: Record<string, number> = {
  "": 200,
  Gadget: 53,
  Widget: 54,
  "Gadget,Widget": 107,
};

function parseBody(body: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(String(body ?? "{}"));
  if (!isObject(parsed) || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object body");
  }
  return parsed;
}

function getParameterValue(body: Record<string, unknown>, id: string) {
  const parameters: unknown[] = Array.isArray(body.parameters)
    ? body.parameters
    : [];
  const parameter = parameters
    .filter(isObject)
    .find(
      (parameter) =>
        parameter.id === id &&
        JSON.stringify(parameter.target) === JSON.stringify(CATEGORY_TARGET),
    );
  return parameter?.value;
}

// Like the backend, the count depends on the category filter in the request
function setupDashcardQueryEndpoint(parameterId: string) {
  fetchMock.post(DASHCARD_QUERY_URL, (call) => {
    const value = getParameterValue(parseBody(call.options.body), parameterId);
    const values: unknown[] = Array.isArray(value) ? value : [];
    const key = values.map(String).sort().join(",");
    return createMockDataset({
      data: {
        rows: [[COUNTS[key] ?? -1]],
        cols: [
          createMockNumericColumn({
            name: "count",
            display_name: "Count",
            source: "aggregation",
            field_ref: ["aggregation", 0],
          }),
        ],
      },
    });
  });
}

// Like the real API, a GET after a PUT returns the updated dashboard
function setupPersistedDashboardEndpoints(dashboard: Dashboard) {
  let persistedDashboard = dashboard;
  fetchMock.get(
    `path:/api/dashboard/${dashboard.id}`,
    () => persistedDashboard,
  );
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, (call) => {
    // The app builds the body from its own Dashboard state, so it has the
    // shape of a dashboard update
    const update = parseBody(call.options.body) as Partial<Dashboard>;
    persistedDashboard = {
      ...persistedDashboard,
      ...update,
      dashcards:
        update.dashcards?.map((dashcard) =>
          createDashcard(dashcard.parameter_mappings ?? []),
        ) ?? persistedDashboard.dashcards,
    };
    return persistedDashboard;
  });
}

function setupParameterValuesEndpoint(parameter: Parameter) {
  fetchMock.get(
    `path:/api/dashboard/${DASHBOARD_ID}/params/${parameter.id}/values`,
    {
      values: [["Doohickey"], ["Gadget"], ["Gizmo"], ["Widget"]],
      has_more_values: false,
    },
  );
}

interface SetupOpts {
  parameter?: Parameter;
  dashboard?: Partial<Dashboard>;
  isEmbedded?: boolean;
}

async function setup({
  parameter = FILTER,
  dashboard: dashboardOpts,
  isEmbedded = false,
}: SetupOpts = {}) {
  const currentUser = createMockUser();
  const dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    parameters: [parameter],
    dashcards: [
      createDashcard([{ parameter_id: parameter.id, target: CATEGORY_TARGET }]),
    ],
    param_fields: { [parameter.id]: [createProductsCategoryField()] },
    ...dashboardOpts,
  });

  setupNotificationChannelsEndpoints({});
  setupSubscriptionsEndpoint([]);
  setupDatabasesEndpoints([DATABASE]);
  setupCollectionsEndpoints({ collections: [] });
  setupBookmarksEndpoints([]);
  setupUsersEndpoints([currentUser]);
  setupRevisionsEndpoints([]);
  setupPersistedDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({ databases: [DATABASE] }),
  );
  setupDashcardQueryEndpoint(parameter.id);
  setupParameterValuesEndpoint(parameter);

  if (isEmbedded) {
    window.overrideIsWithinIframe = true;
    // in an iframe the dashboard renders only when the browser URL matches the route
    window.history.pushState({}, "", `/dashboard/${DASHBOARD_ID}`);
  }

  renderWithProviders(
    <Route path="/dashboard/:slug" element={<DashboardApp />} />,
    {
      initialRoute: `/dashboard/${DASHBOARD_ID}`,
      withRouter: true,
      storeInitialState: {
        currentUser,
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [DATABASE] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
        embed: createMockEmbedState({
          options: createMockEmbedOptions(
            isEmbedded ? { side_nav: false, logo: false } : {},
          ),
        }),
      },
    },
  );

  await waitForDashboardToLoad();
}

function getQueryCalls() {
  return fetchMock.callHistory.calls(DASHCARD_QUERY_URL);
}

function getQueriedValues() {
  return getQueryCalls().map((call) =>
    getParameterValue(parseBody(call.options.body), FILTER.id),
  );
}

function getDefaultQueriedValues() {
  return getQueryCalls().map((call) =>
    getParameterValue(
      parseBody(call.options.body),
      FILTER_WITH_DEFAULT_VALUE.id,
    ),
  );
}

function getPutCalls() {
  return fetchMock.callHistory.calls(`path:/api/dashboard/${DASHBOARD_ID}`, {
    method: "PUT",
  });
}

function getDashcard() {
  return screen.getByTestId("dashcard");
}

async function expectCount(count: number) {
  await waitFor(() =>
    expect(within(getDashcard()).getByTestId("scalar-value")).toHaveTextContent(
      String(count),
    ),
  );
}

function getFilterWidget(name: string) {
  return within(
    screen.getByTestId("dashboard-parameters-widget-container"),
  ).getByLabelText(name);
}

async function selectValues(
  widgetText: string,
  values: string[],
  buttonName: "Add filter" | "Update filter",
) {
  await userEvent.click(
    within(
      screen.getByTestId("dashboard-parameters-widget-container"),
    ).getByText(widgetText),
  );
  const dropdown = await screen.findByTestId("parameter-value-dropdown");
  for (const value of values) {
    await userEvent.click(await within(dropdown).findByLabelText(value));
  }
  await userEvent.click(
    within(dropdown).getByRole("button", { name: buttonName }),
  );
}

async function openSettingsSidebar() {
  await userEvent.click(
    screen.getByRole("button", { name: /Move, trash, and more/ }),
  );
  await userEvent.click(await screen.findByText("Edit settings"));
  return screen.findByRole("dialog", { name: "Dashboard settings" });
}

async function closeSettingsSidebar() {
  const sidebar = screen.getByRole("dialog", { name: "Dashboard settings" });
  await userEvent.click(within(sidebar).getByRole("button", { name: "Close" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Dashboard settings" }),
    ).not.toBeInTheDocument(),
  );
}

async function toggleAutoApply({ from, to }: { from: boolean; to: boolean }) {
  const putCount = getPutCalls().length;
  const sidebar = await openSettingsSidebar();
  const toggle = within(sidebar).getByLabelText("Auto-apply filters");
  if (from) {
    expect(toggle).toBeChecked();
  } else {
    expect(toggle).not.toBeChecked();
  }
  await userEvent.click(toggle);
  await waitFor(() => expect(getPutCalls()).toHaveLength(putCount + 1));
  expect(parseBody(getPutCalls()[putCount].options.body)).toEqual({
    auto_apply_filters: to,
  });
  await waitFor(() => {
    const toggle = within(sidebar).getByLabelText("Auto-apply filters");
    if (to) {
      expect(toggle).toBeChecked();
    } else {
      expect(toggle).not.toBeChecked();
    }
  });
  await closeSettingsSidebar();
}

function checkToast() {
  const toast = getApplyToast();
  if (!toast) {
    throw new Error("Expected the apply filters toast");
  }
  return toast;
}

function getApplyToast() {
  return screen.queryByTestId("filter-apply-toast");
}

describe("DashboardApp > auto-apply filters", () => {
  let trackSchemaEvent: jest.SpiedFunction<typeof Analytics.trackSchemaEvent>;

  beforeEach(() => {
    trackSchemaEvent = jest.spyOn(Analytics, "trackSchemaEvent");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.overrideIsWithinIframe;
    window.history.pushState({}, "", "/");
  });

  function getDisabledEvents() {
    return trackSchemaEvent.mock.calls.filter(
      ([schema, data]) =>
        schema === "dashboard" &&
        isObject(data) &&
        data.event === "auto_apply_filters_disabled",
    );
  }

  it("should handle toggling auto-apply filters on and off and track only disabling them", async () => {
    await setup();
    await expectCount(200);
    expect(getQueriedValues()).toEqual([null]);

    // changing a value by default reloads the card
    await selectValues("Category", ["Gadget"], "Add filter");
    await expectCount(53);
    expect(getQueriedValues()).toEqual([null, ["Gadget"]]);

    // values are kept when auto-apply is turned off
    await toggleAutoApply({ from: true, to: false });
    expect(getDisabledEvents()).toEqual([
      [
        "dashboard",
        { event: "auto_apply_filters_disabled", dashboard_id: DASHBOARD_ID },
      ],
    ]);
    expect(getFilterWidget("Category")).toHaveTextContent("Gadget");
    await expectCount(53);

    // draft values are applied manually
    await selectValues("Gadget", ["Widget"], "Update filter");
    expect(await screen.findByTestId("filter-apply-toast")).toHaveTextContent(
      "1 filter changed",
    );
    await expectCount(53);
    expect(getQueryCalls()).toHaveLength(2);

    await userEvent.click(
      within(checkToast()).getByRole("button", { name: "Apply" }),
    );
    await expectCount(107);
    expect(getQueriedValues()).toEqual([
      null,
      ["Gadget"],
      ["Gadget", "Widget"],
    ]);
    expect(getApplyToast()).not.toBeInTheDocument();

    // draft values are applied when auto-apply is turned on
    await selectValues("2 selections", ["Gadget"], "Update filter");
    expect(getFilterWidget("Category")).toHaveTextContent("Widget");
    expect(await screen.findByTestId("filter-apply-toast")).toBeInTheDocument();

    await toggleAutoApply({ from: false, to: true });
    expect(getDisabledEvents()).toHaveLength(1);
    expect(getFilterWidget("Category")).toHaveTextContent("Widget");
    await expectCount(54);
    expect(getQueriedValues()).toEqual([
      null,
      ["Gadget"],
      ["Gadget", "Widget"],
      ["Widget"],
    ]);
    expect(getApplyToast()).not.toBeInTheDocument();

    // values applied while auto-applying are kept when it is turned off
    await selectValues("Widget", ["Gadget"], "Update filter");
    await expectCount(107);
    await toggleAutoApply({ from: true, to: false });
    expect(getFilterWidget("Category")).toHaveTextContent("2 selections");
    await expectCount(107);
    expect(getQueriedValues()).toEqual([
      null,
      ["Gadget"],
      ["Gadget", "Widget"],
      ["Widget"],
      ["Widget", "Gadget"],
    ]);
    expect(getApplyToast()).not.toBeInTheDocument();

    expect(getPutCalls()).toHaveLength(3);
    expect(getDisabledEvents()).toHaveLength(2);
  });

  it("should not save draft values, allow resetting them, and keep them when editing is cancelled but not when the dashboard is saved", async () => {
    await setup({ dashboard: { auto_apply_filters: false } });
    await expectCount(200);

    await selectValues("Category", ["Gadget"], "Add filter");
    expect(await screen.findByTestId("filter-apply-toast")).toHaveTextContent(
      "1 filter changed",
    );
    expect(
      within(checkToast()).getByRole("button", { name: "Apply" }),
    ).toBeInTheDocument();

    // cancel editing
    await userEvent.click(screen.getByLabelText("Edit dashboard"));
    await userEvent.click(
      within(await screen.findByTestId("edit-bar")).getByRole("button", {
        name: "Cancel",
      }),
    );
    await screen.findByLabelText("Edit dashboard");
    expect(getFilterWidget("Category")).toHaveTextContent("Gadget");
    expect(
      within(checkToast()).getByRole("button", { name: "Apply" }),
    ).toBeInTheDocument();

    // the draft value never reaches the backend, which stores last used
    // values only from card queries
    await expectCount(200);
    expect(getQueriedValues()).toEqual([null]);
    expect(getPutCalls()).toHaveLength(0);

    // an unapplied value can be reset
    await userEvent.click(
      within(checkToast()).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(getApplyToast()).not.toBeInTheDocument());
    expect(getFilterWidget("Category")).not.toHaveTextContent("Gadget");

    await userEvent.click(
      within(
        screen.getByTestId("dashboard-parameters-widget-container"),
      ).getByText("Category"),
    );
    const dropdown = await screen.findByTestId("parameter-value-dropdown");
    expect(within(dropdown).getByLabelText("Gadget")).not.toBeChecked();
    await userEvent.click(within(dropdown).getByLabelText("Gadget"));
    expect(within(dropdown).getByLabelText("Gadget")).toBeChecked();
    await userEvent.click(
      within(dropdown).getByRole("button", { name: "Add filter" }),
    );
    expect(await screen.findByTestId("filter-apply-toast")).toHaveTextContent(
      "1 filter changed",
    );

    // edit and save the dashboard
    await userEvent.click(screen.getByLabelText("Edit dashboard"));
    await userEvent.click(
      await screen.findByLabelText("Add a filter or parameter"),
    );
    await userEvent.click(await screen.findByText("Text or Category"));
    const sidebar = await screen.findByTestId("dashboard-parameter-sidebar");
    await userEvent.click(within(sidebar).getByDisplayValue("Is"));
    await userEvent.click(await screen.findByRole("option", { name: "Is" }));
    const label = within(sidebar).getByDisplayValue("Text");
    await userEvent.clear(label);
    await userEvent.type(label, "Vendor");
    await userEvent.click(
      within(getDashcard()).getByRole("button", { name: /Select…/ }),
    );
    await userEvent.click(
      await screen.findByRole("heading", { name: "Vendor" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByLabelText("Edit dashboard");

    const filters = screen.getByTestId("dashboard-parameters-widget-container");
    expect(within(filters).getByText("Category")).toBeInTheDocument();
    expect(within(filters).getByText("Vendor")).toBeInTheDocument();
    expect(within(filters).queryByText("Gadget")).not.toBeInTheDocument();
    expect(getApplyToast()).not.toBeInTheDocument();

    expect(getPutCalls()).toHaveLength(1);
    const body = parseBody(getPutCalls()[0].options.body);
    expect(body).toHaveProperty("parameters", [
      expect.objectContaining({ id: FILTER.id, name: "Category" }),
      expect.objectContaining({ name: "Vendor", type: "string/=" }),
    ]);
    const parameters: unknown[] = Array.isArray(body.parameters)
      ? body.parameters
      : [];
    const vendorParameter = parameters.filter(isObject)[1];
    const vendorParameterId = vendorParameter?.id;
    expect(vendorParameterId).toEqual(expect.any(String));
    expect(body).toHaveProperty("dashcards", [
      expect.objectContaining({
        parameter_mappings: [
          expect.objectContaining({ parameter_id: FILTER.id }),
          expect.objectContaining({
            parameter_id: vendorParameterId,
            target: [
              "dimension",
              ["field", PRODUCTS.VENDOR, expect.anything()],
              { "stage-number": 0 },
            ],
          }),
        ],
      }),
    ]);
    expect(getQueriedValues().flat()).not.toContain("Gadget");
  });

  it("should keep applying a default value after turning auto-apply off, and not restore it after it was cleared", async () => {
    await setup({ parameter: FILTER_WITH_DEFAULT_VALUE });
    await expectCount(53);

    // the default value is still applied after turning auto-apply off
    await toggleAutoApply({ from: true, to: false });
    await expectCount(53);
    expect(getDefaultQueriedValues()).toEqual([["Gadget"]]);

    // the card is updated after the filter is changed by hand
    await userEvent.click(
      within(getFilterWidget(FILTER_WITH_DEFAULT_VALUE.name)).getByRole(
        "button",
        { name: "Clear" },
      ),
    );
    await expectCount(53);
    await userEvent.click(
      within(checkToast()).getByRole("button", { name: "Apply" }),
    );
    await expectCount(200);
    expect(getDefaultQueriedValues()).toEqual([["Gadget"], null]);

    // the default value is not used after turning auto-apply on again,
    // because the filter was changed by hand
    await toggleAutoApply({ from: false, to: true });
    await expectCount(200);
    expect(getDefaultQueriedValues()).toEqual([["Gadget"], null]);
  });

  it("should apply filters after clicking the apply button in full-app embedding", async () => {
    await setup({
      isEmbedded: true,
      dashboard: {
        name: "Full-app embedding dashboard",
        auto_apply_filters: false,
      },
    });
    expect(
      await screen.findByDisplayValue("Full-app embedding dashboard"),
    ).toBeInTheDocument();
    await expectCount(200);

    await selectValues("Category", ["Widget"], "Add filter");
    await expectCount(200);
    expect(getQueriedValues()).toEqual([null]);

    await userEvent.click(
      within(checkToast()).getByRole("button", { name: "Apply" }),
    );
    await waitFor(() => expect(getApplyToast()).not.toBeInTheDocument());
    await expectCount(54);
    expect(getQueriedValues()).toEqual([null, ["Widget"]]);
  });
});
