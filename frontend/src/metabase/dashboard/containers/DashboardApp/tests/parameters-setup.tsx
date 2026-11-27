import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
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
  createMockDOMRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForDashboardToLoad,
  within,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  Dashboard,
  DashboardCard,
  ParameterTarget,
  VirtualCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCategoryColumn,
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockParameter,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

registerVisualizations();
registerDashboardVisualizations();

export const DASHBOARD_ID = 1;

export const CATEGORY_PARAMETER = createMockParameter({
  id: "1b9cd9f1",
  name: "Category",
  type: "string/=",
  slug: "category",
  sectionId: "string",
});

export const COUNT_PARAMETER = createMockParameter({
  id: "88a1257c",
  name: "Count",
  type: "number/<=",
  slug: "count",
  sectionId: "number",
});

export const CATEGORY_TARGET: ParameterTarget = [
  "dimension",
  ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
  { "stage-number": 0 },
];

export const COUNT_TARGET: ParameterTarget = [
  "dimension",
  ["field", "count", { "base-type": "type/Integer" }],
  { "stage-number": 1 },
];

const countByCategoryQuery = (aggregation: "count" | "avg") =>
  Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [
          aggregation === "count"
            ? { type: "operator", operator: "count", args: [] }
            : {
                type: "operator",
                operator: "avg",
                args: [{ type: "column", name: "TOTAL" }],
              },
        ],
        breakouts: [
          {
            type: "column",
            fieldId: PRODUCTS.CATEGORY,
            sourceFieldId: ORDERS.PRODUCT_ID,
          },
        ],
      },
    ],
  });

export const ORDERS_COUNT_BY_CATEGORY_CARD = createMockCard({
  id: 1,
  name: "test question",
  display: "table",
  dataset_query: countByCategoryQuery("count"),
});

export const AVERAGE_TOTAL_BY_CATEGORY_CARD = createMockCard({
  id: 2,
  name: "Average total by category",
  display: "table",
  dataset_query: countByCategoryQuery("avg"),
});

export const CARDS = [
  ORDERS_COUNT_BY_CATEGORY_CARD,
  AVERAGE_TOTAL_BY_CATEGORY_CARD,
];

// Order counts by product category in the sample database
export const CATEGORY_COUNTS: [string, number][] = [
  ["Doohickey", 3976],
  ["Gadget", 4939],
  ["Gizmo", 4784],
  ["Widget", 5061],
];

export const CATEGORIES = CATEGORY_COUNTS.map(([category]) => category);

const categoryColumn = createMockCategoryColumn({
  id: PRODUCTS.CATEGORY,
  name: "CATEGORY",
  display_name: "Product → Category",
  source: "breakout",
  fk_field_id: ORDERS.PRODUCT_ID,
  field_ref: [
    "field",
    PRODUCTS.CATEGORY,
    { "source-field": ORDERS.PRODUCT_ID },
  ],
});

const countColumn = createMockNumericColumn({
  id: undefined,
  name: "count",
  display_name: "Count",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

type QueryParameter = {
  id: string;
  target: unknown;
  value: unknown;
};

export function getQueryParameters(body: unknown): QueryParameter[] {
  if (!isObject(body) || !Array.isArray(body.parameters)) {
    return [];
  }
  return body.parameters.filter(isObject).map((parameter) => ({
    id: String(parameter.id),
    target: parameter.target,
    value: parameter.value,
  }));
}

function getTargetFieldName(target: unknown): unknown {
  if (!Array.isArray(target)) {
    return undefined;
  }
  const fieldRef: unknown = target[1];
  if (!Array.isArray(fieldRef)) {
    return undefined;
  }
  const fieldName: unknown = fieldRef[1];
  return fieldName;
}

function toList(value: unknown): unknown[] {
  if (value == null) {
    return [];
  }
  if (Array.isArray(value)) {
    const list: unknown[] = value;
    return list;
  }
  return [value];
}

/**
 * Like the backend, filters the order counts by the category and count
 * parameters in the dashcard query request.
 */
export function filterCategoryCounts(body: unknown) {
  return getQueryParameters(body).reduce((rows, { target, value }) => {
    const values = toList(value);
    if (values.length === 0) {
      return rows;
    }
    const fieldName = getTargetFieldName(target);
    if (fieldName === PRODUCTS.CATEGORY) {
      return rows.filter(([category]) => values.includes(category));
    }
    if (fieldName === "count") {
      return rows.filter(([, count]) => count <= Number(values[0]));
    }
    return rows;
  }, CATEGORY_COUNTS);
}

export const DASHCARD_QUERY_URL = `express:/api/dashboard/${DASHBOARD_ID}/dashcard/:dashcardId/card/:cardId/query`;

function setupDashcardQueryEndpoint() {
  fetchMock.post(DASHCARD_QUERY_URL, (call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    return createMockDataset({
      data: createMockDatasetData({
        cols: [categoryColumn, countColumn],
        rows: filterCategoryCounts(body),
      }),
    });
  });
}

export const PARAMETER_VALUES_URL = `express:/api/dashboard/${DASHBOARD_ID}/params/:parameterId/values`;
export const PARAMETER_SEARCH_URL = `express:/api/dashboard/${DASHBOARD_ID}/params/:parameterId/search/:query`;

function setupParameterValuesEndpoints(getDashboard: () => Dashboard) {
  fetchMock.get(PARAMETER_VALUES_URL, (call) => {
    const parameterId = call.url.split("/params/")[1]?.split("/")[0];
    // Like the backend, only a filter mapped to the category column has values
    const isMappedToCategory = getDashboard().dashcards.some((dashcard) =>
      dashcard.parameter_mappings?.some(
        (mapping) =>
          mapping.parameter_id === parameterId &&
          getTargetFieldName(mapping.target) === PRODUCTS.CATEGORY,
      ),
    );
    return {
      values: isMappedToCategory
        ? CATEGORIES.map((category) => [category])
        : [],
      has_more_values: false,
    };
  });
  fetchMock.get(PARAMETER_SEARCH_URL, { values: [], has_more_values: false });
}

function getVirtualCard(dashcard: unknown): VirtualCard | undefined {
  if (!isObject(dashcard) || !isObject(dashcard.visualization_settings)) {
    return undefined;
  }
  const virtualCard = dashcard.visualization_settings.virtual_card;
  // The frontend sends the virtual card it got from the backend
  return isObject(virtualCard) ? (virtualCard as VirtualCard) : undefined;
}

/**
 * Like the real API, a PUT stores the dashboard with full dashcards and gives
 * new dashcards an id, and a later GET returns the stored dashboard.
 */
function setupPersistedDashboardEndpoints(dashboard: Dashboard) {
  let persistedDashboard = dashboard;
  let nextDashcardId = 100;

  fetchMock.get(
    `path:/api/dashboard/${dashboard.id}`,
    () => persistedDashboard,
  );
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, (call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    if (!isObject(body) || Array.isArray(body)) {
      throw new Error("Expected a dashboard update object");
    }
    const dashcards = Array.isArray(body.dashcards)
      ? body.dashcards.filter(isObject).map((dashcard) => {
          const card: Card | VirtualCard | undefined =
            CARDS.find((card) => card.id === dashcard.card_id) ??
            getVirtualCard(dashcard);
          const id =
            typeof dashcard.id === "number" && dashcard.id > 0
              ? dashcard.id
              : nextDashcardId++;
          // The frontend sends dashcards in the API shape
          return {
            ...dashcard,
            id,
            dashboard_id: dashboard.id,
            card,
          } as unknown as DashboardCard;
        })
      : persistedDashboard.dashcards;
    persistedDashboard = {
      ...persistedDashboard,
      ...body,
      dashcards,
    };
    return persistedDashboard;
  });

  return () => persistedDashboard;
}

const PX_PER_CHARACTER = 10;
const TABLE_RECT = { width: 800, height: 400 };

/**
 * jsdom has no layout. The table, which virtualizes its rows, and the elements
 * that hold it get a fixed size to render them. Any other element gets a width
 * that grows with its text, so an inline filter list fits a card wider than
 * its text, like in a browser.
 */
function mockTextWidthLayout() {
  jest
    .spyOn(window.Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      const tableSelector = '[data-testid="table-root"]';
      const isTablePart =
        this.closest(tableSelector) != null ||
        this.querySelector(tableSelector) != null;
      return createMockDOMRect(
        isTablePart
          ? TABLE_RECT
          : {
              width: (this.textContent?.length ?? 0) * PX_PER_CHARACTER,
              height: TABLE_RECT.height,
            },
      );
    });
}

export type SetupOpts = {
  dashboard: Partial<Dashboard>;
};

export async function setup({ dashboard: dashboardOpts }: SetupOpts) {
  const dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    name: "Test Dashboard",
    ...dashboardOpts,
  });
  const database = createSampleDatabase();

  mockTextWidthLayout();
  setupNotificationChannelsEndpoints({});
  setupSubscriptionsEndpoint([]);
  setupDatabasesEndpoints([database]);
  const getDashboard = setupPersistedDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({
      databases: [database],
      tables: database.tables,
      cards: CARDS,
    }),
  );
  setupDashcardQueryEndpoint();
  setupParameterValuesEndpoints(getDashboard);
  setupCollectionsEndpoints({ collections: [] });
  setupSearchEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([]);
  setupCardsEndpoints(CARDS);
  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);

  const { router, store } = renderWithProviders(
    <Route
      path="/dashboard/:slug"
      element={
        <>
          <DashboardApp />
          <UndoListing />
        </>
      }
    />,
    {
      initialRoute: `/dashboard/${dashboard.id}`,
      withRouter: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [database] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );

  await waitForDashboardToLoad();

  return { router: checkNotNull(router), store };
}

export function getDashcards() {
  return screen.getAllByTestId("dashcard");
}

export function getDashcard(index: number) {
  return checkNotNull(getDashcards()[index]);
}

export async function startEditing() {
  await userEvent.click(screen.getByLabelText("Edit dashboard"));
  await screen.findByTestId("edit-bar");
}

export async function saveDashboard() {
  await userEvent.click(screen.getByTestId("save-edit-button"));
  await waitFor(() =>
    expect(screen.queryByTestId("edit-bar")).not.toBeInTheDocument(),
  );
}

export async function getSavedDashboard() {
  const call = await waitFor(() =>
    checkNotNull(
      fetchMock.callHistory.lastCall(`path:/api/dashboard/${DASHBOARD_ID}`, {
        method: "PUT",
      }),
    ),
  );
  const body: unknown = JSON.parse(String(call.options.body));
  return body;
}

export function getParameterSidebar() {
  return screen.getByTestId("dashboard-parameter-sidebar");
}

export async function clickDone() {
  await userEvent.click(
    within(getParameterSidebar()).getByRole("button", { name: "Done" }),
  );
}

export async function clickRemove() {
  const button = within(getParameterSidebar()).getByRole("button", {
    name: "Remove",
  });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
}

export function getEditingWidget(container: HTMLElement, name: string) {
  return checkNotNull(
    within(container)
      .queryAllByTestId("editing-parameter-widget")
      .find((widget) => widget.textContent?.startsWith(name)),
  );
}

export function queryEditingWidgetNames(container: HTMLElement) {
  return within(container)
    .queryAllByTestId("editing-parameter-widget")
    .map((widget) => widget.textContent);
}

export function queryWidgetNames(container: HTMLElement) {
  return within(container)
    .queryAllByTestId("parameter-widget")
    .map((widget) => widget.textContent?.replace(/\s/g, " "));
}

export function getMapper(dashcard: HTMLElement) {
  return within(dashcard).getByTestId("parameter-mapper-container");
}

export async function selectMappingColumn(
  dashcard: HTMLElement,
  columnName: string | RegExp,
) {
  await userEvent.click(within(getMapper(dashcard)).getByRole("button"));
  await userEvent.click(
    await screen.findByRole("heading", { name: columnName }),
  );
}

export function getTableRows(dashcard: HTMLElement) {
  const body = within(dashcard).queryByTestId("table-body");
  if (body == null) {
    return [];
  }
  return within(body)
    .queryAllByRole("row")
    .map((row) => row.textContent);
}

export function getLastDashcardQueryBody(dashcardId: number) {
  const call = fetchMock.callHistory.lastCall(
    `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${dashcardId}/card/${ORDERS_COUNT_BY_CATEGORY_CARD.id}/query`,
  );
  const body: unknown = JSON.parse(String(checkNotNull(call).options.body));
  return body;
}

export function getSearchParams(search: string) {
  return Object.fromEntries(new URLSearchParams(search));
}
