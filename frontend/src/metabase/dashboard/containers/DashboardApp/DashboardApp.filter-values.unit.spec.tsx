import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupParameterValuesEndpoints,
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
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  Dashboard,
  Field,
  FieldValue,
  Parameter,
  ParameterValue,
  ParameterValues,
  TableId,
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
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  createOrdersQuantityField,
  createOrdersTotalField,
  createProductsCategoryField,
  createProductsIdField,
  createProductsRatingField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

registerVisualizations();

const DATABASE = createSampleDatabase();
const DASHBOARD_ID = 1;
const DASHCARD_ID = 1;
const TARGET_CARD_ID = 1;
const DASHCARD_QUERY_URL = `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${DASHCARD_ID}/card/${TARGET_CARD_ID}/query`;

/** A dashboard filter, the column it filters and the values the backend has for it */
type FilterSetup = {
  parameter: Parameter;
  field: Field;
  /** What GET /params/:id/values returns */
  values?: ParameterValues;
  /** What GET /params/:id/search/:query returns, by query; any other query returns no values */
  search?: Record<string, FieldValue[]>;
  /** The [value, label] pairs GET /params/:id/remapping knows; any other value comes back without a label */
  remappings?: FieldValue[];
};

/** The count the dashcard shows when the filter values in the request match */
type QueryResult = {
  parameterValues: Record<Parameter["id"], unknown>;
  count: number;
};

interface SetupOpts {
  tableId: TableId;
  filters: FilterSetup[];
  queryResults: QueryResult[];
  unfilteredCount: number;
}

function createCountCard(tableId: TableId): Card {
  return createMockCard({
    id: TARGET_CARD_ID,
    name: "Count",
    display: "scalar",
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: tableId },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
        },
      ],
    }),
  });
}

function parseBody(body: unknown): unknown {
  return JSON.parse(String(body ?? "{}"));
}

function getRequestParameterValues(body: unknown) {
  const parameters =
    isObject(body) && Array.isArray(body.parameters) ? body.parameters : [];
  return Object.fromEntries(
    parameters
      .filter(isObject)
      .map((parameter) => [String(parameter.id), parameter.value]),
  );
}

function isSameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Like the backend, the dashcard count depends on the filter values sent with
// the query, and every filter without a value is ignored
function setupDashcardQueryEndpoint({
  queryResults,
  unfilteredCount,
}: Pick<SetupOpts, "queryResults" | "unfilteredCount">) {
  fetchMock.post(DASHCARD_QUERY_URL, (call) => {
    const requestValues = getRequestParameterValues(
      parseBody(call.options.body),
    );
    const activeIds = Object.keys(requestValues).filter(
      (id) => requestValues[id] != null,
    );
    const result = queryResults.find(
      ({ parameterValues }) =>
        isSameValue(Object.keys(parameterValues).sort(), activeIds.sort()) &&
        activeIds.every((id) =>
          isSameValue(requestValues[id], parameterValues[id]),
        ),
    );
    const count = activeIds.length === 0 ? unfilteredCount : result?.count;
    if (count == null) {
      return { status: 400 };
    }
    return createMockDataset({
      data: {
        rows: [[count]],
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

// Like the backend, a filter only gets its own values, and a search only
// returns the values that match the query
function setupDashboardParameterValuesEndpoints(filters: FilterSetup[]) {
  filters.forEach(({ parameter, values, search = {}, remappings = [] }) => {
    fetchMock.get(
      `path:/api/dashboard/${DASHBOARD_ID}/params/${parameter.id}/remapping`,
      (call) => {
        const value = new URL(call.url).searchParams.get("value");
        return (
          remappings.find(
            (remapping) =>
              Array.isArray(remapping) && String(remapping[0]) === value,
          ) ?? [value]
        );
      },
    );
    if (values) {
      fetchMock.get(
        `path:/api/dashboard/${DASHBOARD_ID}/params/${parameter.id}/values`,
        values,
      );
    }
    fetchMock.get(
      `begin:${location.origin}/api/dashboard/${DASHBOARD_ID}/params/${parameter.id}/search/`,
      (call) => {
        const query = decodeURIComponent(
          new URL(call.url).pathname.split("/").pop() ?? "",
        );
        return { values: search[query] ?? [], has_more_values: false };
      },
    );
  });
}

function setup({ tableId, filters, queryResults, unfilteredCount }: SetupOpts) {
  const card = createCountCard(tableId);
  const dashboard: Dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    parameters: filters.map(({ parameter }) => parameter),
    param_fields: Object.fromEntries(
      filters.map(({ parameter, field }) => [parameter.id, [field]]),
    ),
    dashcards: [
      createMockDashboardCard({
        id: DASHCARD_ID,
        dashboard_id: DASHBOARD_ID,
        card_id: card.id,
        card,
        size_x: 8,
        size_y: 6,
        parameter_mappings: filters.map(({ parameter, field }) => ({
          parameter_id: parameter.id,
          card_id: card.id,
          target: ["dimension", ["field", field.id, null]],
        })),
      }),
    ],
  });

  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([DATABASE]);
  setupCollectionsEndpoints({ collections: [] });
  setupBookmarksEndpoints([]);
  fetchMock.get(`path:/api/dashboard/${DASHBOARD_ID}`, dashboard);
  fetchMock.get(
    `path:/api/dashboard/${DASHBOARD_ID}/query_metadata`,
    createMockDashboardQueryMetadata({ databases: [DATABASE] }),
  );
  setupDashcardQueryEndpoint({ queryResults, unfilteredCount });
  setupDashboardParameterValuesEndpoints(filters);

  renderWithProviders(
    <Route path="/dashboard/:slug" element={<DashboardApp />} />,
    {
      initialRoute: `/dashboard/${DASHBOARD_ID}`,
      withRouter: true,
      storeInitialState: {
        currentUser: createMockUser(),
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [DATABASE] }),
        settings: mockSettings(),
      },
    },
  );
}

function getFilterWidget(name: string) {
  return within(
    screen.getByTestId("dashboard-parameters-widget-container"),
  ).getByLabelText(name);
}

function getDashcard() {
  return screen.getByTestId("dashcard");
}

function getLastQueryValues() {
  return getRequestParameterValues(
    parseBody(fetchMock.callHistory.lastCall(DASHCARD_QUERY_URL)?.options.body),
  );
}

const NUMBER_STATIC_VALUES: ParameterValue[] = [
  ["10", "Ten"],
  ["20", "Twenty"],
  ["30"],
];

describe("DashboardApp > filter values", () => {
  describe("static list source on a number filter", () => {
    const DROPDOWN_FILTER: FilterSetup = {
      parameter: createMockParameter({
        id: "number-dropdown",
        name: "Number",
        slug: "number",
        type: "number/=",
        sectionId: "number",
        values_query_type: "list",
        values_source_type: "static-list",
        values_source_config: { values: NUMBER_STATIC_VALUES },
      }),
      field: createOrdersQuantityField(),
      values: {
        values: [["10", "Ten"], ["20", "Twenty"], ["30"]],
        has_more_values: false,
      },
      remappings: [
        ["10", "Ten"],
        ["20", "Twenty"],
      ],
    };
    const SEARCH_FILTER: FilterSetup = {
      parameter: createMockParameter({
        id: "number-search",
        name: "Number search",
        slug: "number_search",
        type: "number/=",
        sectionId: "number",
        values_query_type: "search",
        values_source_type: "static-list",
        values_source_config: { values: NUMBER_STATIC_VALUES },
      }),
      field: createOrdersQuantityField(),
      search: {
        T: [
          ["10", "Ten"],
          ["20", "Twenty"],
        ],
      },
      remappings: [
        ["10", "Ten"],
        ["20", "Twenty"],
      ],
    };
    const QUERY_RESULTS: QueryResult[] = [
      { parameterValues: { [DROPDOWN_FILTER.parameter.id]: ["20"] }, count: 4 },
      { parameterValues: { [SEARCH_FILTER.parameter.id]: [20] }, count: 4 },
    ];

    function setupNumberFilters() {
      setup({
        tableId: ORDERS_ID,
        filters: [DROPDOWN_FILTER, SEARCH_FILTER],
        queryResults: QUERY_RESULTS,
        unfilteredCount: 18760,
      });
    }

    it("should show the labels in a dropdown list and filter by the picked value", async () => {
      setupNumberFilters();
      await waitForDashboardToLoad();
      expect(
        await within(getDashcard()).findByText("18,760"),
      ).toBeInTheDocument();

      await userEvent.click(getFilterWidget("Number"));
      const popover = await screen.findByTestId("parameter-value-dropdown");
      expect(await within(popover).findByText("Ten")).toBeInTheDocument();
      expect(
        within(popover).getByPlaceholderText("Search the list"),
      ).toBeInTheDocument();
      expect(within(popover).getByText("30")).toBeInTheDocument();
      await userEvent.click(within(popover).getByText("Twenty"));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Add filter" }),
      );

      await waitFor(() =>
        expect(getFilterWidget("Number")).toHaveTextContent("Twenty"),
      );
      expect(await within(getDashcard()).findByText("4")).toBeInTheDocument();
      expect(getLastQueryValues()).toMatchObject({
        [DROPDOWN_FILTER.parameter.id]: ["20"],
      });

      await userEvent.click(
        within(getFilterWidget("Number")).getByRole("button", {
          name: "Clear",
        }),
      );
      expect(
        await within(getDashcard()).findByText("18,760"),
      ).toBeInTheDocument();
    });

    it("should show the labels of the search results in a search box and filter by the picked value", async () => {
      setupNumberFilters();
      await waitForDashboardToLoad();

      await userEvent.click(getFilterWidget("Number search"));
      const popover = await screen.findByTestId("parameter-value-dropdown");
      await userEvent.type(
        within(popover).getByPlaceholderText("Enter a number"),
        "T",
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "Twenty" }),
      );
      await userEvent.click(
        within(popover).getByRole("button", { name: "Add filter" }),
      );

      await waitFor(() =>
        expect(getFilterWidget("Number search")).toHaveTextContent("Twenty"),
      );
      expect(await within(getDashcard()).findByText("4")).toBeInTheDocument();
      expect(getLastQueryValues()).toMatchObject({
        [SEARCH_FILTER.parameter.id]: [20],
      });
    });
  });

  describe("static list source when the filter type changes", () => {
    const FILTER: FilterSetup = {
      parameter: createMockParameter({
        id: "number-dropdown",
        name: "Number",
        slug: "number",
        type: "number/=",
        sectionId: "number",
        values_query_type: "list",
        values_source_type: "static-list",
        values_source_config: { values: NUMBER_STATIC_VALUES },
      }),
      field: createOrdersQuantityField(),
    };

    async function openSidebarSelect(currentValue: string, option: string) {
      const sidebar = screen.getByTestId("dashboard-parameter-sidebar");
      // the filter label input can show the same text as the type select
      const select = within(sidebar)
        .getAllByDisplayValue(currentValue)
        .find((input) => input.getAttribute("aria-haspopup") === "listbox");
      await userEvent.click(checkNotNull(select));
      await userEvent.click(
        await screen.findByRole("option", { name: option }),
      );
    }

    async function getCustomListValue() {
      const sidebar = screen.getByTestId("dashboard-parameter-sidebar");
      await userEvent.click(
        within(sidebar).getByRole("button", { name: "Edit" }),
      );
      const modal = await screen.findByRole("dialog");
      await userEvent.click(within(modal).getByText("Custom list"));
      const value = within(modal).getByRole("textbox");
      return { modal, value };
    }

    it("should clear the static list when the type changes and restore it when the type changes back", async () => {
      setupSubscriptionsEndpoint([]);
      // The values of the connected Email column, for the source modal preview
      setupParameterValuesEndpoints({
        values: [["borer-hudson@yahoo.com"]],
        has_more_values: false,
      });
      setup({
        tableId: ORDERS_ID,
        filters: [FILTER],
        queryResults: [],
        unfilteredCount: 18760,
      });
      await waitForDashboardToLoad();

      await userEvent.click(screen.getByLabelText("Edit dashboard"));
      await userEvent.click(
        within(
          screen.getByTestId("edit-dashboard-parameters-widget-container"),
        ).getByText("Number"),
      );
      await screen.findByTestId("dashboard-parameter-sidebar");

      await openSidebarSelect("Number", "Text or Category");
      await openSidebarSelect("Is", "Is");
      let customList = await getCustomListValue();
      expect(customList.value).toHaveValue("");
      await userEvent.click(within(customList.modal).getByLabelText("Close"));

      await userEvent.click(
        within(getDashcard()).getByRole("button", { name: /Select…/ }),
      );
      await userEvent.click(await screen.findByText("Email"));
      const sidebar = screen.getByTestId("dashboard-parameter-sidebar");
      await userEvent.click(
        within(sidebar).getByRole("button", { name: "Edit" }),
      );
      const modal = await screen.findByRole("dialog");
      await userEvent.click(within(modal).getByText("From connected fields"));
      await userEvent.click(
        within(modal).getByRole("button", { name: "Done" }),
      );

      await openSidebarSelect("Text or Category", "Number");
      await openSidebarSelect("Equal to", "Equal to");
      customList = await getCustomListValue();
      expect(customList.value).toHaveValue("10, Ten\n20, Twenty\n30");
    });
  });

  describe("question source with a numeric column", () => {
    // The first rows of the "Orders" question, cut short to keep the list small
    const ORDER_IDS: FieldValue[] = [
      ...Array.from({ length: 30 }, (_, index) => index + 1),
      120,
      200,
      220,
      225,
    ].map((id) => [id]);
    const CARD_SOURCE_CONFIG = {
      card_id: 2,
      value_field: ["field", ORDERS.ID, null],
    } satisfies Parameter["values_source_config"];
    const SINGLE_FILTER: FilterSetup = {
      parameter: createMockParameter({
        id: "total-lte",
        name: "Less than or equal to",
        slug: "less_than_or_equal_to",
        type: "number/<=",
        sectionId: "number",
        values_query_type: "list",
        values_source_type: "card",
        values_source_config: CARD_SOURCE_CONFIG,
      }),
      field: createOrdersTotalField(),
      values: { values: ORDER_IDS, has_more_values: true },
    };
    const MULTI_FILTER: FilterSetup = {
      parameter: createMockParameter({
        id: "quantity-eq",
        name: "Equal to",
        slug: "equal_to",
        type: "number/=",
        sectionId: "number",
        values_query_type: "list",
        values_source_type: "card",
        values_source_config: CARD_SOURCE_CONFIG,
      }),
      field: createOrdersQuantityField(),
      values: { values: ORDER_IDS, has_more_values: true },
    };
    const QUERY_RESULTS: QueryResult[] = [
      { parameterValues: { [SINGLE_FILTER.parameter.id]: [5] }, count: 1 },
      { parameterValues: { [SINGLE_FILTER.parameter.id]: [20] }, count: 52 },
      {
        parameterValues: { [MULTI_FILTER.parameter.id]: [7, 25] },
        count: 932,
      },
      {
        parameterValues: { [MULTI_FILTER.parameter.id]: [7, 25, 225] },
        count: 932,
      },
    ];

    function setupCardSourceFilters() {
      setup({
        tableId: ORDERS_ID,
        filters: [SINGLE_FILTER, MULTI_FILTER],
        queryResults: QUERY_RESULTS,
        unfilteredCount: 18760,
      });
    }

    it("should pick a single value with and without searching the list", async () => {
      setupCardSourceFilters();
      await waitForDashboardToLoad();

      await userEvent.click(getFilterWidget("Less than or equal to"));
      let popover = await screen.findByTestId("parameter-value-dropdown");
      await userEvent.click(await within(popover).findByText("5"));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Add filter" }),
      );
      expect(await within(getDashcard()).findByText("1")).toBeInTheDocument();
      expect(getLastQueryValues()).toMatchObject({
        [SINGLE_FILTER.parameter.id]: [5],
      });

      await userEvent.click(getFilterWidget("Less than or equal to"));
      popover = await screen.findByTestId("parameter-value-dropdown");
      expect(
        await within(popover).findByTestId("5-filter-value"),
      ).toBeInTheDocument();
      await userEvent.type(
        within(popover).getByPlaceholderText("Search the list"),
        "20",
      );
      await waitFor(() =>
        expect(
          within(popover).queryByTestId("5-filter-value"),
        ).not.toBeInTheDocument(),
      );
      await userEvent.click(within(popover).getByText("20"));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Update filter" }),
      );
      expect(await within(getDashcard()).findByText("52")).toBeInTheDocument();
      expect(getLastQueryValues()).toMatchObject({
        [SINGLE_FILTER.parameter.id]: [20],
      });
    });

    it("should pick multiple values with and without searching the list", async () => {
      setupCardSourceFilters();
      await waitForDashboardToLoad();

      await userEvent.click(getFilterWidget("Equal to"));
      let popover = await screen.findByTestId("parameter-value-dropdown");
      await userEvent.click(await within(popover).findByText("7"));
      await userEvent.click(within(popover).getByText("25"));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Add filter" }),
      );
      expect(await within(getDashcard()).findByText("932")).toBeInTheDocument();
      expect(getLastQueryValues()).toMatchObject({
        [MULTI_FILTER.parameter.id]: [7, 25],
      });

      await userEvent.click(getFilterWidget("Equal to"));
      popover = await screen.findByTestId("parameter-value-dropdown");
      expect(await within(popover).findByLabelText("7")).toBeChecked();
      expect(within(popover).getByLabelText("25")).toBeChecked();
      await userEvent.type(
        within(popover).getByPlaceholderText("Search the list"),
        "225",
      );
      await waitFor(() =>
        expect(within(popover).queryByLabelText("7")).not.toBeInTheDocument(),
      );
      await userEvent.click(within(popover).getByText("225"));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Update filter" }),
      );
      await waitFor(() =>
        expect(getLastQueryValues()).toMatchObject({
          [MULTI_FILTER.parameter.id]: [7, 25, 225],
        }),
      );

      await userEvent.click(getFilterWidget("Equal to"));
      popover = await screen.findByTestId("parameter-value-dropdown");
      expect(await within(popover).findByLabelText("7")).toBeChecked();
      expect(within(popover).getByLabelText("25")).toBeChecked();
      expect(within(popover).getByLabelText("225")).toBeChecked();
    });
  });

  describe("question source with a label column", () => {
    // Like a native question `SELECT ID, TITLE FROM PRODUCTS ORDER BY ID LIMIT 5`
    const PRODUCT_TITLES: FieldValue[] = [
      [1, "Rustic Paper Wallet"],
      [2, "Small Marble Shoes"],
      [3, "Synergistic Granite Chair"],
      [4, "Enormous Aluminum Shirt"],
      [5, "Enormous Marble Wallet"],
    ];
    const LABEL_SOURCE_CONFIG = {
      card_id: 3,
      value_field: ["field", "ID", { "base-type": "type/BigInteger" }],
      label_field: ["field", "TITLE", { "base-type": "type/Text" }],
    } satisfies Parameter["values_source_config"];
    const NUMBER_FILTER: FilterSetup = {
      parameter: createMockParameter({
        id: "number-label",
        name: "Number label",
        slug: "number_label",
        type: "number/=",
        sectionId: "number",
        values_query_type: "list",
        values_source_type: "card",
        values_source_config: LABEL_SOURCE_CONFIG,
      }),
      field: createProductsRatingField(),
      values: { values: PRODUCT_TITLES, has_more_values: false },
      remappings: PRODUCT_TITLES,
    };
    const ID_FILTER: FilterSetup = {
      parameter: createMockParameter({
        id: "id-label",
        name: "ID label",
        slug: "id_label",
        type: "id",
        sectionId: "id",
        values_query_type: "list",
        values_source_type: "card",
        values_source_config: LABEL_SOURCE_CONFIG,
      }),
      field: createProductsIdField(),
      values: { values: PRODUCT_TITLES, has_more_values: false },
      remappings: PRODUCT_TITLES,
    };

    function setupLabelFilters() {
      setup({
        tableId: PRODUCTS_ID,
        filters: [NUMBER_FILTER, ID_FILTER],
        queryResults: [
          { parameterValues: { [NUMBER_FILTER.parameter.id]: [2] }, count: 0 },
          { parameterValues: { [ID_FILTER.parameter.id]: [2] }, count: 1 },
        ],
        unfilteredCount: 200,
      });
    }

    it.each([
      { filter: NUMBER_FILTER, count: "0" },
      { filter: ID_FILTER, count: "1" },
    ])(
      "should show the labels instead of the values for the $filter.parameter.name filter",
      async ({ filter, count }) => {
        setupLabelFilters();
        await waitForDashboardToLoad();
        const { name } = filter.parameter;

        await userEvent.click(getFilterWidget(name));
        const popover = await screen.findByTestId("parameter-value-dropdown");
        expect(
          await within(popover).findByText("Rustic Paper Wallet"),
        ).toBeInTheDocument();
        expect(within(popover).queryByText("1")).not.toBeInTheDocument();
        expect(within(popover).queryByText("2")).not.toBeInTheDocument();
        await userEvent.click(within(popover).getByText("Small Marble Shoes"));
        await userEvent.click(
          within(popover).getByRole("button", { name: "Add filter" }),
        );

        expect(
          await within(getDashcard()).findByText(count),
        ).toBeInTheDocument();
        expect(getLastQueryValues()).toMatchObject({
          [filter.parameter.id]: [2],
        });
        expect(
          await within(getFilterWidget(name)).findByText("Small Marble Shoes"),
        ).toBeInTheDocument();
        expect(
          within(getFilterWidget(name)).getByText("- 2"),
        ).toBeInTheDocument();
      },
    );
  });

  describe("static list source with a search box on a text filter", () => {
    const FILTER: FilterSetup = {
      parameter: createMockParameter({
        id: "list-search",
        name: "List search",
        slug: "list_search",
        type: "string/=",
        sectionId: "string",
        values_query_type: "search",
        values_source_type: "static-list",
        values_source_config: {
          values: [["Gadget"], ["Gizmo", "Gizmo Label"], ["Widget"]],
        },
      }),
      field: createProductsCategoryField(),
      search: { "Gizmo Label": [["Gizmo", "Gizmo Label"]] },
      remappings: [["Gizmo", "Gizmo Label"]],
    };

    it("should find a value by its label and show the label", async () => {
      setup({
        tableId: PRODUCTS_ID,
        filters: [FILTER],
        queryResults: [
          { parameterValues: { [FILTER.parameter.id]: ["Gizmo"] }, count: 51 },
        ],
        unfilteredCount: 200,
      });
      await waitForDashboardToLoad();

      await userEvent.click(getFilterWidget("List search"));
      const popover = await screen.findByTestId("parameter-value-dropdown");
      await userEvent.type(
        within(popover).getByRole("combobox"),
        "Gizmo Label",
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "Gizmo Label" }),
      );
      expect(
        await within(within(popover).getByTestId("token-field")).findByText(
          "Gizmo Label",
        ),
      ).toBeInTheDocument();
      await userEvent.click(
        within(popover).getByRole("button", { name: "Add filter" }),
      );

      expect(
        await within(getFilterWidget("List search")).findByText("Gizmo Label"),
      ).toBeInTheDocument();
      expect(await within(getDashcard()).findByText("51")).toBeInTheDocument();
      expect(getLastQueryValues()).toMatchObject({
        [FILTER.parameter.id]: ["Gizmo"],
      });
    });
  });
});
