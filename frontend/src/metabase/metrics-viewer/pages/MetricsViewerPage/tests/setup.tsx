import {
  cursorDocEnd,
  cursorDocStart,
  deleteCharBackward,
  deleteCharForward,
} from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { getConfig } from "@testing-library/dom";
import { act, fireEvent, within } from "@testing-library/react";
import Color from "color";
import fetchMock from "fetch-mock";

import {
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import {
  type SerializedMetricsViewerPageState,
  decodeState,
  encodeState,
} from "metabase/common/metrics-viewer";
import { Route } from "metabase/router";
import type {
  DatasetColumn,
  DatetimeUnit,
  InstanceFilter,
  Measure,
  Metric,
  MetricDatasetRequest,
  MetricDimension,
  RawSeries,
  RowValue,
  Segment,
  TypedProjection,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockMeasure,
  createMockSearchResult,
} from "metabase-types/api/mocks";

import { MetricsViewerPage } from "../MetricsViewerPage";

// ── Fixture dimensions ──

type DimensionValues = {
  values: RowValue[];
  /**
   * With a date range filter, one value is left for each `daysPerValue` days
   * of the range, so the rows depend on the bounds the request sends.
   */
  daysPerValue?: number;
};

const CATEGORY_VALUES = ["Doohickey", "Gadget", "Gizmo", "Widget"];
const SOURCE_VALUES = ["Affiliate", "Facebook", "Google", "Organic", "Twitter"];
const STATE_VALUES = ["CA", "NY", "TX"];

const TIME_VALUES_BY_UNIT: Record<string, RowValue[]> = {
  month: [
    "2027-01-01T00:00:00Z",
    "2027-02-01T00:00:00Z",
    "2027-03-01T00:00:00Z",
  ],
  year: [
    "2025-01-01T00:00:00Z",
    "2026-01-01T00:00:00Z",
    "2027-01-01T00:00:00Z",
  ],
  week: ["2027-01-03T00:00:00Z", "2027-01-10T00:00:00Z"],
};

export function timeDimension(
  id: string,
  name: string,
  displayName: string,
  fieldId: number,
  opts: Partial<MetricDimension> = {},
): MetricDimension {
  return {
    id,
    name,
    display_name: displayName,
    effective_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    sources: [{ type: "field", "field-id": fieldId }],
    ...opts,
  };
}

export function textDimension(
  id: string,
  name: string,
  displayName: string,
  semanticType: string,
  fieldId: number,
  opts: Partial<MetricDimension> = {},
): MetricDimension {
  return {
    id,
    name,
    display_name: displayName,
    effective_type: "type/Text",
    semantic_type: semanticType,
    has_field_values: "list",
    sources: [{ type: "field", "field-id": fieldId }],
    ...opts,
  };
}

export function numberDimension(
  id: string,
  name: string,
  displayName: string,
  semanticType: string | null,
  fieldId: number,
  opts: Partial<MetricDimension> = {},
): MetricDimension {
  return {
    id,
    name,
    display_name: displayName,
    effective_type: "type/Integer",
    semantic_type: semanticType,
    sources: [{ type: "field", "field-id": fieldId }],
    ...opts,
  };
}

export const PRODUCT_GROUP = {
  id: "product",
  type: "connection" as const,
  display_name: "Product",
};
export const USER_GROUP = {
  id: "user",
  type: "connection" as const,
  display_name: "User",
};

// Field ids follow the sample database presets, so dimensions that read the
// same column share a source.
export const FIELD = {
  ORDERS_CREATED_AT: 14,
  ORDERS_TOTAL: 13,
  ORDERS_QUANTITY: 12,
  PRODUCTS_CATEGORY: 1,
  PRODUCTS_CREATED_AT: 6,
  PRODUCTS_TITLE: 8,
  PRODUCTS_VENDOR: 4,
  PRODUCTS_PRICE: 7,
  PRODUCTS_RATING: 2,
  PEOPLE_SOURCE: 36,
  PEOPLE_STATE: 33,
  PEOPLE_BIRTH_DATE: 35,
  PEOPLE_CREATED_AT: 38,
  ACCOUNTS_COUNTRY: 500,
  ACCOUNTS_CREATED_AT: 501,
  FEEDBACK_RATING: 600,
  FEEDBACK_CREATED_AT: 601,
};

export const ORDERS_METRIC: Metric = {
  id: 1,
  name: "Count of orders",
  description: null,
  collection_id: null,
  dimension_mappings: [],
  dimensions: [
    timeDimension(
      "orders-created-at",
      "CREATED_AT",
      "Created At",
      FIELD.ORDERS_CREATED_AT,
      { default_temporal_unit: "month" },
    ),
    textDimension(
      "orders-product-category",
      "CATEGORY",
      "Category",
      "type/Category",
      FIELD.PRODUCTS_CATEGORY,
      { group: PRODUCT_GROUP },
    ),
    textDimension(
      "orders-user-source",
      "SOURCE",
      "Source",
      "type/Source",
      FIELD.PEOPLE_SOURCE,
      { group: USER_GROUP },
    ),
    textDimension(
      "orders-user-state",
      "STATE",
      "State",
      "type/State",
      FIELD.PEOPLE_STATE,
      { group: USER_GROUP },
    ),
    timeDimension(
      "orders-user-birth-date",
      "BIRTH_DATE",
      "Birth Date",
      FIELD.PEOPLE_BIRTH_DATE,
      {
        effective_type: "type/Date",
        semantic_type: null,
        group: USER_GROUP,
      },
    ),
    numberDimension(
      "orders-quantity",
      "QUANTITY",
      "Quantity",
      "type/Quantity",
      FIELD.ORDERS_QUANTITY,
    ),
  ],
};

export const PRODUCTS_METRIC: Metric = {
  id: 2,
  name: "Count of products",
  description: null,
  collection_id: null,
  dimension_mappings: [],
  dimensions: [
    timeDimension(
      "products-created-at",
      "CREATED_AT",
      "Created At",
      FIELD.PRODUCTS_CREATED_AT,
      { default_temporal_unit: "month" },
    ),
    textDimension(
      "products-title",
      "TITLE",
      "Title",
      "type/Title",
      FIELD.PRODUCTS_TITLE,
    ),
    textDimension(
      "products-category",
      "CATEGORY",
      "Category",
      "type/Category",
      FIELD.PRODUCTS_CATEGORY,
    ),
    textDimension(
      "products-vendor",
      "VENDOR",
      "Vendor",
      "type/Company",
      FIELD.PRODUCTS_VENDOR,
    ),
    numberDimension(
      "products-price",
      "PRICE",
      "Price",
      "type/Price",
      FIELD.PRODUCTS_PRICE,
      { effective_type: "type/Float" },
    ),
    numberDimension(
      "products-rating",
      "RATING",
      "Rating",
      "type/Score",
      FIELD.PRODUCTS_RATING,
      { effective_type: "type/Float" },
    ),
  ],
};

export const FEEDBACK_METRIC: Metric = {
  id: 3,
  name: "Count of feedback",
  description: null,
  collection_id: null,
  dimension_mappings: [],
  dimensions: [
    timeDimension(
      "feedback-created-at",
      "DATE_RECEIVED",
      "Date Received",
      FIELD.FEEDBACK_CREATED_AT,
      { default_temporal_unit: "month" },
    ),
    numberDimension(
      "feedback-rating",
      "RATING",
      "Rating",
      "type/Score",
      FIELD.FEEDBACK_RATING,
    ),
  ],
};

export const TEST_MEASURE: Measure = createMockMeasure({
  id: 100,
  name: "Test Measure",
  table_id: 2,
  dimensions: [
    timeDimension(
      "measure-created-at",
      "CREATED_AT",
      "Created At",
      FIELD.ORDERS_CREATED_AT,
      { default_temporal_unit: "month" },
    ),
    textDimension(
      "measure-product-category",
      "CATEGORY",
      "Category",
      "type/Category",
      FIELD.PRODUCTS_CATEGORY,
      { group: PRODUCT_GROUP },
    ),
    textDimension(
      "measure-user-state",
      "STATE",
      "State",
      "type/State",
      FIELD.PEOPLE_STATE,
      { group: USER_GROUP },
    ),
  ],
  dimension_mappings: [],
});

// ── Dataset mock ──

const DIMENSION_VALUES: Record<string, DimensionValues> = {
  "type/Category": { values: CATEGORY_VALUES },
  "type/Source": { values: SOURCE_VALUES },
  "type/State": { values: STATE_VALUES },
  "type/Country": { values: ["DE", "FR", "US"] },
  "type/Title": { values: ["Aerodynamic Bottle", "Lightweight Wool Bag"] },
  "type/Company": { values: ["Acme", "Globex"] },
  "type/Price": { values: [10, 20] },
  "type/Score": { values: [3, 4, 5] },
  "type/Currency": { values: [20, 40] },
  "type/Quantity": {
    values: [1, 2, 3, 4, 5, 6],
    daysPerValue: 3,
  },
};

type DimensionRefOptions = {
  "temporal-unit"?: DatetimeUnit;
  binning?: unknown;
};

type DimensionRef = [string, DimensionRefOptions, string];

function isDimensionRef(value: unknown): value is DimensionRef {
  return (
    Array.isArray(value) &&
    value[0] === "dimension" &&
    typeof value[2] === "string"
  );
}

function getDimensionRefs(projection: TypedProjection): DimensionRef[] {
  return projection.projection.filter(isDimensionRef);
}

function findFilterDimensionRef(filter: unknown): DimensionRef | undefined {
  if (!Array.isArray(filter)) {
    return undefined;
  }
  return filter.find(isDimensionRef);
}

export type DatasetMockOptions = {
  dimensions: MetricDimension[];
  /** Metrics whose queries match no rows. */
  emptyMetricIds?: number[];
};

function findDimension(
  dimensions: MetricDimension[],
  id: string,
): MetricDimension {
  const dimension = dimensions.find((dimension) => dimension.id === id);
  if (!dimension) {
    throw new Error(`Unknown dimension ${id} in a dataset request`);
  }
  return dimension;
}

function isTimeDimension(dimension: MetricDimension) {
  return /Date|Time/.test(dimension.effective_type);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The number of days a `between` filter on a time dimension covers. */
function getDateRangeDays(
  filters: InstanceFilter[],
  dimensions: MetricDimension[],
): number | null {
  for (const { filter } of filters) {
    const filterRef = findFilterDimensionRef(filter);
    if (
      !Array.isArray(filter) ||
      filter[0] !== "between" ||
      !filterRef ||
      !isTimeDimension(findDimension(dimensions, filterRef[2]))
    ) {
      continue;
    }
    const [start, end] = filter.slice(3).map((value) => Date.parse(value));
    return Math.round((end - start) / DAY_MS) + 1;
  }
  return null;
}

function getValuesForDimension(
  dimension: MetricDimension,
  ref: DimensionRef,
  filters: InstanceFilter[],
  dimensions: MetricDimension[],
): RowValue[] {
  if (isTimeDimension(dimension)) {
    return TIME_VALUES_BY_UNIT[ref[1]["temporal-unit"] ?? "month"] ?? [];
  }

  const catalog = DIMENSION_VALUES[dimension.semantic_type ?? ""];
  if (!catalog) {
    throw new Error(`No fixture values for dimension ${dimension.id}`);
  }
  const rangeDays = getDateRangeDays(filters, dimensions);
  const values =
    rangeDays != null && catalog.daysPerValue != null
      ? catalog.values.slice(0, Math.ceil(rangeDays / catalog.daysPerValue))
      : catalog.values;

  // Apply "is" filters on this dimension's column: the backend returns only
  // the matching rows.
  return filters.reduce<RowValue[]>((result, { filter }) => {
    const filterRef = findFilterDimensionRef(filter);
    if (!Array.isArray(filter) || !filterRef) {
      return result;
    }
    const filterDimension = findDimension(dimensions, filterRef[2]);
    const isSameColumn =
      filterDimension.semantic_type === dimension.semantic_type;
    if (!isSameColumn) {
      return result;
    }
    const filterValues: unknown[] = filter.slice(3);
    if (filter[0] === "=") {
      return result.filter((value) => filterValues.includes(value));
    }
    if (filter[0] === "!=") {
      return result.filter((value) => !filterValues.includes(value));
    }
    return result;
  }, values);
}

function createDimensionColumn(
  dimension: MetricDimension,
  ref: DimensionRef,
): DatasetColumn {
  return createMockColumn({
    name: dimension.name ?? dimension.id,
    display_name: dimension.display_name,
    base_type: dimension.effective_type,
    effective_type: dimension.effective_type,
    semantic_type: dimension.semantic_type ?? undefined,
    source: "breakout",
    unit: isTimeDimension(dimension)
      ? (ref[1]["temporal-unit"] ?? "month")
      : undefined,
  });
}

const METRIC_COLUMN = createMockColumn({
  name: "count",
  display_name: "Count",
  base_type: "type/Integer",
  effective_type: "type/Integer",
  semantic_type: undefined,
  source: "aggregation",
});

function cartesianProduct(lists: RowValue[][]): RowValue[][] {
  return lists.reduce<RowValue[][]>(
    (rows, values) => rows.flatMap((row) => values.map((v) => [...row, v])),
    [[]],
  );
}

function getExpressionMetricIds(expression: unknown): number[] {
  if (!Array.isArray(expression)) {
    return [];
  }
  if (expression[0] === "metric" && typeof expression[2] === "number") {
    return [expression[2]];
  }
  return expression.flatMap(getExpressionMetricIds);
}

export function buildDataset(
  request: MetricDatasetRequest,
  { dimensions, emptyMetricIds = [] }: DatasetMockOptions,
) {
  const { projections = [], filters = [], expression } = request.definition;
  const isEmpty = getExpressionMetricIds(expression).some((id) =>
    emptyMetricIds.includes(id),
  );
  // Arithmetic requests project the same dimension once per leaf; the result
  // has one column per dimension.
  const refs = projections.length > 0 ? getDimensionRefs(projections[0]) : [];
  const dimensionColumns = refs.map((ref) =>
    createDimensionColumn(findDimension(dimensions, ref[2]), ref),
  );
  const valueLists = refs.map((ref) =>
    getValuesForDimension(
      findDimension(dimensions, ref[2]),
      ref,
      filters,
      dimensions,
    ),
  );
  const rows = isEmpty
    ? []
    : cartesianProduct(valueLists).map((row, index) => [
        ...row,
        (index + 1) * 10,
      ]);

  return {
    data: {
      cols: [...dimensionColumns, METRIC_COLUMN],
      rows,
      results_metadata: { columns: [] },
    },
    row_count: rows.length,
    status: "completed",
  };
}

// ── Visualization stub ──

/**
 * The explorer hands its chart series to `Visualization`. ECharts needs a
 * layout that jsdom does not have, so the stub prints what the explorer hands
 * to the chart: the display, each series name, the dimension values of its
 * rows and the series colors.
 */
export function MockVisualization({ rawSeries }: { rawSeries: RawSeries }) {
  const [firstSeries] = rawSeries;
  const settings = firstSeries?.card.visualization_settings ?? {};
  const seriesSettings = settings.series_settings ?? {};

  return (
    <div
      data-testid="visualization-root"
      data-display={firstSeries?.card.display}
      data-split-panels={String(Boolean(settings["graph.split_panels"]))}
    >
      {rawSeries.map((series, index) => (
        <div key={index} data-testid="chart-series">
          <span data-testid="chart-series-name">{series.card.name}</span>
          {series.data.rows.map((row, rowIndex) => (
            <span key={rowIndex} data-testid="chart-row-dimension">
              {String(row[0])}
              {series.data.cols.length > 2 ? ` ${String(row[1])}` : ""}
            </span>
          ))}
        </div>
      ))}
      {Object.entries(seriesSettings).map(([key, value]) => (
        <span
          key={key}
          data-testid="chart-series-color"
          data-color={value?.color ? normalizeColor(value.color) : undefined}
        >
          {value?.title ?? key}
        </span>
      ))}
    </div>
  );
}

// ── Setup ──

export type SetupOpts = {
  metrics?: Metric[];
  measures?: Measure[];
  segments?: Segment[];
  state?: SerializedMetricsViewerPageState;
  initialRoute?: string;
  emptyMetricIds?: number[];
  /** Delays the metric and measure responses, like a slow backend. */
  metadataDelay?: number;
};

export const DEFAULT_METRICS = [
  ORDERS_METRIC,
  PRODUCTS_METRIC,
  FEEDBACK_METRIC,
];

export function setupEndpoints({
  metrics = DEFAULT_METRICS,
  measures = [TEST_MEASURE],
  segments = [],
  emptyMetricIds = [],
  metadataDelay,
}: SetupOpts = {}) {
  const allDimensions = [
    ...metrics.flatMap((metric) => metric.dimensions ?? []),
    ...measures.flatMap((measure) => measure.dimensions ?? []),
  ];

  setupSearchEndpoints([
    ...metrics.map((metric) =>
      createMockSearchResult({
        id: metric.id,
        model: "metric",
        name: metric.name,
      }),
    ),
    ...measures.map((measure) =>
      createMockSearchResult({
        id: measure.id,
        model: "measure",
        name: measure.name,
        table_id: measure.table_id,
      }),
    ),
  ]);
  setupSegmentsEndpoints(segments);
  setupRecentViewsAndSelectionsEndpoints([]);
  metrics.forEach((metric) => {
    fetchMock.get(`path:/api/metric/${metric.id}`, metric, {
      delay: metadataDelay,
    });
    (metric.dimensions ?? []).forEach((dimension) => {
      fetchMock.get(
        `path:/api/metric/${metric.id}/dimension/${dimension.id}/values`,
        {
          values: (
            DIMENSION_VALUES[dimension.semantic_type ?? ""]?.values ?? []
          ).map((value) => [value]),
          has_more_values: false,
        },
      );
    });
  });
  measures.forEach((measure) => {
    fetchMock.get(`path:/api/measure/${measure.id}`, measure, {
      delay: metadataDelay,
    });
  });
  fetchMock.post(
    "path:/api/metric/dataset",
    async (call) => {
      const request: MetricDatasetRequest = JSON.parse(
        String(call.options.body),
      );
      return buildDataset(request, {
        dimensions: allDimensions,
        emptyMetricIds,
      });
    },
    { name: "metric-dataset" },
  );
  fetchMock.post(
    "path:/api/metric/breakout-values",
    async (call) => {
      const request: MetricDatasetRequest = JSON.parse(
        String(call.options.body),
      );
      const dataset = buildDataset(request, { dimensions: allDimensions });
      const breakoutIndex = dataset.data.cols.length - 2;
      return {
        col: dataset.data.cols[breakoutIndex],
        values: [
          ...new Set(dataset.data.rows.map((row) => row[breakoutIndex])),
        ],
      };
    },
    { name: "metric-breakout-values" },
  );
}

export function getStateHash(state: SerializedMetricsViewerPageState) {
  const hash = encodeState(state);
  if (hash === undefined) {
    throw new Error("Could not encode the viewer state");
  }
  return hash;
}

export function metricsState(
  formulaEntities: SerializedMetricsViewerPageState["formulaEntities"],
): SerializedMetricsViewerPageState {
  return {
    formulaEntities,
    dimensionBreakouts: [],
    selectedDimensionBreakoutId: null,
  };
}

export function renderPage({
  state,
  initialRoute = state ? `/explore#${getStateHash(state)}` : "/explore",
}: Pick<SetupOpts, "state" | "initialRoute"> = {}) {
  // The search picker renders a virtual list, which needs element sizes.
  mockGetBoundingClientRect();
  const result = renderWithProviders(
    <Route path="/explore" element={<MetricsViewerPage />} />,
    { withRouter: true, initialRoute },
  );
  const router = result.router;
  if (!router) {
    throw new Error("The page needs a router");
  }
  // The page reads `window.location.hash` to decide whether a URL change is a
  // new history entry. The memory router does not touch `window.location`, so
  // mirror its location there the way the browser would.
  const syncWindowLocation = () => {
    const { pathname, search, hash } = router.location;
    window.history.replaceState(null, "", `${pathname}${search}${hash}`);
  };
  syncWindowLocation();
  const unsubscribe = router.onLocationChange(syncWindowLocation);

  return { ...result, router, unsubscribe };
}

export function setup(opts: SetupOpts = {}) {
  setupEndpoints(opts);
  return renderPage(opts);
}

/** Unmounts the page and renders it again from the current URL, like a reload. */
export async function reloadPage(page: ReturnType<typeof renderPage>) {
  const { pathname, search, hash } = page.router.location;
  page.unsubscribe();
  page.unmount();
  return renderPage({ initialRoute: `${pathname}${search}${hash}` });
}

/**
 * Lets responses and store notifications that are still in flight land before
 * the test ends, then resets the URL the page mirrored.
 */
export async function cleanupPage() {
  await getConfig().asyncWrapper(async () => {
    await fetchMock.callHistory.flush(true);
    await sleep(SETTLE_MS);
  });
  window.history.replaceState(null, "", "/");
}

// ── Queries ──

export function normalizeColor(color: string) {
  return Color(color).hex().toUpperCase();
}

export function getPills() {
  return screen.getAllByTestId(/^metrics-viewer-(pill|expression-pill)$/);
}

export async function findPills(count: number) {
  await waitFor(() => expect(getPills()).toHaveLength(count));
  return getPills();
}

export function getPillColors(pill: HTMLElement): string[] {
  const container = within(pill).getByTestId("color-indicator-container");
  const indicators = Array.from(container.children);
  expect(indicators.length).toBeGreaterThan(0);
  return indicators.map((child) => {
    if (!(child instanceof HTMLElement) && !(child instanceof SVGElement)) {
      throw new Error("Unexpected color indicator");
    }
    const { backgroundColor, color } = child.style;
    return normalizeColor(backgroundColor || color);
  });
}

export function getChartColors(): string[] {
  return screen
    .getAllByTestId("chart-series-color")
    .map((element) => element.getAttribute("data-color") ?? "");
}

export function getLegendColors(): Record<string, string> {
  const legend = screen.getByTestId("metrics-viewer-breakout-legend");
  return Object.fromEntries(
    within(legend)
      .getAllByTestId("breakout-legend-dot")
      .map((dot) => [
        dot.nextElementSibling?.textContent ?? "",
        normalizeColor(dot.style.background),
      ]),
  );
}

export function getDatasetRequests(): MetricDatasetRequest[] {
  return fetchMock.callHistory
    .calls("metric-dataset")
    .map((call) => JSON.parse(String(call.options.body)));
}

export function getUrlState(page: ReturnType<typeof renderPage>) {
  return decodeState(page.router.location.hash.replace(/^#/, ""));
}

export function getMetricControls() {
  return screen.getByTestId("metrics-viewer-controls");
}

export async function waitForChart() {
  return screen.findByTestId("visualization-root");
}

// ── Formula editor ──
//
// Specs that use these helpers must call `jest.unmock("@uiw/react-codemirror")`.
// jsdom has no layout, so typing through the DOM garbles CodeMirror's
// document. Text goes through the editor's input handlers instead, the path a
// keystroke takes, and editing keys run CodeMirror's own commands.

function getEditorContent(): HTMLElement {
  const content = screen
    .getByTestId("metrics-viewer-search-input")
    .querySelector<HTMLElement>(".cm-content");
  if (!content) {
    throw new Error("The formula editor is not open");
  }
  return content;
}

export function getEditorView(): EditorView {
  const view = EditorView.findFromDOM(getEditorContent());
  if (!view) {
    throw new Error("No CodeMirror view in the formula editor");
  }
  return view;
}

export function getEditorText() {
  return getEditorView().state.doc.toString();
}

// Popovers, the store and the deferred definition update schedule short
// timers after an interaction. `settle` lets them run the way `waitFor` does,
// with React's act environment off. An async `act` would not do: after its
// callback resolves, it waits a macrotask with no act scope, and a timer that
// fires then is reported as an update outside act.
const SETTLE_MS = 50;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function settle() {
  await getConfig().asyncWrapper(() => sleep(SETTLE_MS));
}

/** Clicks an element and lets the timers the click schedules run. */
export async function click(element: Element) {
  fireEvent.click(element);
  await settle();
}

async function interact(fn: (view: EditorView) => void) {
  act(() => fn(getEditorView()));
  await settle();
}

/** Clicks the formula bar to open the editor, as the e2e helper does. */
export async function openFormulaEditor() {
  if (!screen.queryByTestId("metrics-viewer-search-input")) {
    await click(screen.getByTestId("metrics-formula-input"));
  }
  await waitFor(() => getEditorView());
  await interact((view) => view.focus());
}

export async function typeText(text: string) {
  await interact((view) => {
    for (const char of text) {
      const { from, to } = view.state.selection.main;
      const insert = () =>
        view.state.update({
          changes: { from, to, insert: char },
          selection: { anchor: from + char.length },
          userEvent: "input.type",
        });
      const isHandled = view.state
        .facet(EditorView.inputHandler)
        .some((handler) => handler(view, from, to, char, insert));
      if (!isHandled) {
        view.dispatch(insert());
      }
    }
  });
}

export async function moveCursorToEnd() {
  await interact((view) => cursorDocEnd(view));
}

export async function moveCursorToStart() {
  await interact((view) => cursorDocStart(view));
}

export async function pressBackspace(times = 1) {
  for (let index = 0; index < times; index++) {
    await interact((view) => deleteCharBackward(view));
  }
}

export async function pressDelete(times = 1) {
  for (let index = 0; index < times; index++) {
    await interact((view) => deleteCharForward(view));
  }
}

export async function pressEnter() {
  await interact((view) => {
    fireEvent.keyDown(view.contentDOM, { key: "Enter" });
  });
}

export async function clearEditor() {
  await interact((view) =>
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length },
      userEvent: "delete.cut",
    }),
  );
}

// ── Formula input ──

export type FormulaToken = { name: string } | string;

/** Picks a metric or measure from the search picker under the editor. */
export async function pickSearchResult(name: string) {
  const picker = await screen.findByTestId("mini-picker");
  const item = await waitFor(() => {
    const match = within(picker)
      .getAllByRole("menuitem")
      .find((menuItem) => within(menuItem).queryByText(name) != null);
    if (!match) {
      throw new Error(`No search result named ${name}`);
    }
    return match;
  });
  await click(item);
}

export async function runFormula() {
  const runButton = await screen.findByTestId("run-expression-button");
  expect(runButton).toBeEnabled();
  await click(runButton);
  await waitFor(() =>
    expect(
      screen.queryByTestId("metrics-viewer-search-input"),
    ).not.toBeInTheDocument(),
  );
  expect(screen.queryByTestId("run-expression-button")).not.toBeInTheDocument();
}

/**
 * Enters a formula the way the e2e helper `addMetricInputSequence` did: open
 * the editor, append to the existing formula with a comma unless it starts
 * with an operator, type operators and pick metrics from the search picker.
 */
export async function enterFormula(
  sequence: FormulaToken[],
  { run = true, clear = false }: { run?: boolean; clear?: boolean } = {},
) {
  await openFormulaEditor();
  if (clear) {
    await clearEditor();
  } else if (getEditorText().trim() !== "" && typeof sequence[0] !== "string") {
    await moveCursorToEnd();
    await typeText(", ");
  }
  for (const token of sequence) {
    if (typeof token === "string") {
      await moveCursorToEnd();
      await typeText(token);
    } else {
      await pickSearchResult(token.name);
    }
  }
  if (run) {
    await runFormula();
  }
}

export async function openPillMenu(pill: HTMLElement) {
  await click(pill);
  return screen.findByRole("menu");
}

// ── Dimension picker sidebar ──

export function getSidebar() {
  return screen.getByTestId("metrics-viewer-dimension-picker-sidebar");
}

export function getColumnPickerButton() {
  return within(getMetricControls()).getByLabelText("Change column");
}

export async function openDimensionPickerSidebar() {
  await click(await waitFor(() => getColumnPickerButton()));
  return screen.findByTestId("metrics-viewer-dimension-picker-sidebar");
}

export async function closeDimensionPickerSidebar() {
  await click(within(getSidebar()).getByLabelText("Close"));
}

/** Selects a dimension breakout from the sidebar and closes it. */
export async function selectDimensionBreakout(
  dimensionName: string,
  { seeAll = false }: { seeAll?: boolean } = {},
) {
  const sidebar = await openDimensionPickerSidebar();
  if (seeAll) {
    await click(within(sidebar).getByRole("button", { name: "See all" }));
  }
  await click(within(sidebar).getByRole("button", { name: dimensionName }));
  await closeDimensionPickerSidebar();
}

export function getExpandedMetricAccordion(metricName: string) {
  const button = within(getSidebar()).getByRole("button", {
    name: metricName,
  });
  expect(button).toHaveAttribute("aria-expanded", "true");
  const section = button.parentElement;
  if (!section) {
    throw new Error(`No accordion section for ${metricName}`);
  }
  return section;
}

export async function openTimeDimensionConfiguration() {
  await click(
    within(getSidebar()).getByRole("button", { name: "Configure Time" }),
  );
}

export async function selectMetricDimension(
  metricName: string,
  optionName: RegExp,
) {
  await click(
    within(getSidebar()).getByLabelText(`Select dimension for ${metricName}`),
  );
  await click(await screen.findByRole("option", { name: optionName }));
}

export async function showColumnLabels() {
  await click(
    within(getMetricControls()).getByLabelText("Column label options"),
  );
  await click(
    await screen.findByRole("switch", { name: "Show column labels" }),
  );
}

export function getChartDisplays() {
  return screen
    .getAllByTestId("visualization-root")
    .map((element) => element.getAttribute("data-display"));
}

/** The dimension ids each dataset request projects, per metric or measure. */
export function getProjectedDimensionIds() {
  return getDatasetRequests().flatMap((request) =>
    (request.definition.projections ?? []).map((projection) =>
      projection.projection.map((ref) =>
        Array.isArray(ref) ? String(ref[2]) : "",
      ),
    ),
  );
}
