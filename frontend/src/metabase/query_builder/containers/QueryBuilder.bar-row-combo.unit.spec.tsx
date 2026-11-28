import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";
import _ from "underscore";

import {
  type ChartElementPredicate,
  expectVisibleBar,
  getChartTexts,
  getEChartsTooltip,
  getEChartsTooltipHeader,
  getPathsWithFill,
  getTooltipRows,
  getValueLabels,
  hoverChartElement,
  unhoverChart,
  withFill,
} from "__support__/echarts-dom";
import { setupFieldValuesEndpoint } from "__support__/server-mocks";
import {
  act,
  createMockDOMRect,
  fireEvent,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { serializeCardForUrl } from "metabase/common/utils/card";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Dataset,
  DatasetColumn,
  RowValue,
  TestStageWithSourceSpec,
  UnsavedCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockFieldValues,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
  createOrdersIdDatasetColumn,
  createOrdersTableDatasetColumns,
  createProductsCategoryDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { setup, waitForQueryToStart } from "./test-utils";

registerVisualizations();

const CATEGORIES = ["Doohickey", "Gadget", "Gizmo", "Widget"];
const SOURCES = ["Affiliate", "Facebook", "Google", "Organic", "Twitter"];
const CATEGORY_COLORS: Record<string, string> = {
  Doohickey: "#88BF4D",
  Gadget: "#F9D45C",
  Gizmo: "#A989C5",
  Widget: "#F2A86F",
};

function createAggregationColumn(
  name: string,
  displayName: string,
  index: number,
  baseType = "type/BigInteger",
): DatasetColumn {
  return createMockColumn({
    name,
    display_name: displayName,
    source: "aggregation",
    base_type: baseType,
    effective_type: baseType,
    field_ref: ["aggregation", index],
  });
}

const COUNT_COLUMN = createAggregationColumn("count", "Count", 0);

// the backend tells an implicitly joined column by its fk_field_id
const USER_SOURCE_COLUMN = createMockColumn({
  id: PEOPLE.SOURCE,
  fk_field_id: ORDERS.USER_ID,
  name: "SOURCE",
  display_name: "User → Source",
  source: "breakout",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: "type/Source",
  field_ref: [
    "field",
    "SOURCE",
    { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
  ],
});

const PRODUCT_CATEGORY_COLUMN = createProductsCategoryDatasetColumn({
  source: "breakout",
  fk_field_id: ORDERS.PRODUCT_ID,
  display_name: "Product → Category",
  field_ref: [
    "field",
    PRODUCTS.CATEGORY,
    { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
  ],
});

function createDataset(cols: DatasetColumn[], rows: RowValue[][]): Dataset {
  return createMockDataset({
    data: createMockDatasetData({ cols, rows }),
    row_count: rows.length,
  });
}

const EMPTY_DATASET = createDataset([], []);

// the Sample Database runs queries as they change
const SAMPLE_DATABASE_WITH_AUTO_RUN = {
  ...createSampleDatabase(),
  auto_run_queries: true,
};

function createStructuredQuery(stage: TestStageWithSourceSpec) {
  return Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, { stages: [stage] }),
  );
}

function getRequestBody(call: CallLog): unknown {
  return JSON.parse(String(call.options.body));
}

/** Reads a nested value of a request body, or undefined when it is missing */
function getIn(value: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>(
    (current, key) =>
      current != null && typeof current === "object" && key in current
        ? Reflect.get(current, key)
        : undefined,
    value,
  );
}

function getStage(body: unknown, path: (string | number)[]) {
  return getIn(body, ["stages", 0, ...path]);
}

function getDatasetRequestBodies() {
  return fetchMock.callHistory.calls("dataset-post").map(getRequestBody);
}

function isCountOfOrders(body: unknown) {
  return (
    getIn(body, ["database"]) === SAMPLE_DB_ID &&
    getStage(body, ["source-table"]) === ORDERS_ID &&
    getStage(body, ["aggregation", "length"]) === 1 &&
    getStage(body, ["aggregation", 0, 0]) === "count"
  );
}

function isImplicitBreakout(
  body: unknown,
  index: number,
  fieldId: number,
  sourceFieldId: number,
) {
  return (
    getStage(body, ["breakout", index, 2]) === fieldId &&
    getStage(body, ["breakout", index, 1, "source-field"]) === sourceFieldId
  );
}

/** Count of orders by user source and product category */
function isCountBySourceAndCategory(body: unknown) {
  return (
    isCountOfOrders(body) &&
    getStage(body, ["breakout", "length"]) === 2 &&
    isImplicitBreakout(body, 0, PEOPLE.SOURCE, ORDERS.USER_ID) &&
    isImplicitBreakout(body, 1, PRODUCTS.CATEGORY, ORDERS.PRODUCT_ID)
  );
}

/** The `[operator, options, column, ...values]` filter clauses of a request */
function getFilters(body: unknown): unknown[][] {
  const filters = getStage(body, ["filters"]);
  return Array.isArray(filters) ? filters : [];
}

function isCategoryFilter(filter: unknown[], operator: string) {
  return (
    filter[0] === operator &&
    getIn(filter, [2, 2]) === PRODUCTS.CATEGORY &&
    getIn(filter, [2, 1, "source-field"]) === ORDERS.PRODUCT_ID
  );
}

interface AdhocQuestionOpts {
  card: UnsavedCard;
  respond: (body: unknown) => Dataset;
}

/**
 * Opens an ad-hoc question. POST /api/dataset answers each run with `respond`,
 * which picks the rows from the request body.
 */
async function setupAdhocQuestion({ card, respond }: AdhocQuestionOpts) {
  const result = await setup({
    card,
    database: SAMPLE_DATABASE_WITH_AUTO_RUN,
    // keeps the display the card asks for, as a locked display in the URL does
    initialRoute: `/question#${serializeCardForUrl(card, { includeDisplayIsLocked: true })}`,
    waitForLoad: false,
  });
  // the question runs from a timer after the loader is gone
  fetchMock.modifyRoute("dataset-post", {
    response: (call: CallLog) => respond(getRequestBody(call)),
  });
  await waitForLoaderToBeRemoved();
  await waitForQueryToStart();
  await waitFor(() =>
    expect(fetchMock.callHistory.calls("dataset-post")).toHaveLength(1),
  );
  await act(() => fetchMock.callHistory.flush(true));
  return result;
}

const getChart = () => screen.findByTestId("chart-container");
const getSettingsSidebar = () => screen.getByTestId("chartsettings-sidebar");
const getVisualizationRoot = () =>
  screen.getByTestId("query-visualization-root");

function getLegendItemNames() {
  return screen
    .getAllByTestId("legend-item")
    .map((item) => item.textContent ?? "");
}

function getDraggableItems() {
  return within(getSettingsSidebar()).queryAllByTestId(/^draggable-item-/);
}

function getDraggableItemNames() {
  return getDraggableItems().map((item) => item.textContent ?? "");
}

async function openVizSettings() {
  await userEvent.click(screen.getByTestId("viz-settings-button"));
  return screen.findByTestId("chartsettings-sidebar");
}

async function openSettingsTab(name: string) {
  await userEvent.click(
    within(getSettingsSidebar()).getByRole("tab", { name }),
  );
}

const ITEM_HEIGHT = 40;
const DEFAULT_RECT = { width: 1000, height: 800 };

/**
 * jsdom has no layout. Gives every sortable item a rect from its position in
 * the list, so dnd-kit can find the item a dragged one crosses.
 */
function mockItemRects() {
  jest
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      if (!(this instanceof HTMLElement)) {
        return createMockDOMRect(DEFAULT_RECT);
      }
      const isItem = this.dataset.testid?.startsWith("draggable-item-");
      const items = within(this).queryAllByTestId(/^draggable-item-/);
      // an item, or the sortable wrapper of a single item
      const item = isItem ? this : items.length === 1 ? items[0] : null;
      if (item == null) {
        return createMockDOMRect(DEFAULT_RECT);
      }
      const testIds = getDraggableItems().map((item) => item.dataset.testid);
      const y = testIds.indexOf(item.dataset.testid) * ITEM_HEIGHT;
      return createMockDOMRect({
        x: 0,
        y,
        top: y,
        left: 0,
        width: 300,
        height: ITEM_HEIGHT,
        right: 300,
        bottom: y + ITEM_HEIGHT,
      });
    });
}

async function dragItem({ from, to }: { from: number; to: number }) {
  const items = getDraggableItems();
  const testId = items[from].dataset.testid ?? "";
  const startY = from * ITEM_HEIGHT + ITEM_HEIGHT / 2;
  // dnd-kit picks the item the dragged one overlaps most
  const endY = to * ITEM_HEIGHT + (ITEM_HEIGHT * 3) / 4;

  fireEvent.mouseDown(items[from], { button: 0, clientX: 10, clientY: startY });
  fireEvent.mouseMove(document, { clientX: 10, clientY: startY + 20 });
  fireEvent.mouseMove(document, { clientX: 10, clientY: endY });
  fireEvent.mouseUp(document, { clientX: 10, clientY: endY });
  // The drag overlay renders a copy of the item until its drop animation ends
  await waitFor(() => {
    expect(screen.getAllByTestId(testId)).toHaveLength(1);
  });
}

async function removeDraggableItem(name: string) {
  const item = checkNotNull(
    getDraggableItems().find((item) => item.textContent === name),
  );
  await userEvent.click(within(item).getByLabelText("close icon"));
}

async function addCountOfRows() {
  await userEvent.type(
    await screen.findByLabelText("Add a value by name"),
    "count",
  );
  const options = await screen.findAllByRole("option");
  const countOption = checkNotNull(
    options.find((option) => option.textContent === "Count of rows"),
  );
  await userEvent.click(countOption);
}

/** The data point symbols of a line or area series: a filled path with the series color as its stroke */
const isSymbolWithStroke =
  (color: string): ChartElementPredicate =>
  (style) =>
    style.stroke === color && style.fill != null && style.fill !== "none";

function createCreatedAtColumn(unit: "year"): DatasetColumn {
  return createOrdersCreatedAtDatasetColumn({
    source: "breakout",
    unit,
    display_name: "Created At: Year",
    field_ref: [
      "field",
      ORDERS.CREATED_AT,
      { "base-type": "type/DateTime", "temporal-unit": unit },
    ],
  });
}

async function addAnotherSeries(name: string) {
  await userEvent.click(
    within(getSettingsSidebar()).getByRole("button", {
      name: /Add another series/,
    }),
  );
  await userEvent.click(await screen.findByRole("option", { name }));
}

function createCountBySourceAndCategoryRows(categories: string[]) {
  return SOURCES.flatMap((source, sourceIndex) =>
    categories.map((category) => [
      source,
      category,
      700 + sourceIndex * 50 + CATEGORIES.indexOf(category) * 30,
    ]),
  );
}

const COUNT_BY_SOURCE_AND_CATEGORY_STAGE: TestStageWithSourceSpec = {
  source: { type: "table", id: ORDERS_ID },
  aggregations: [{ type: "operator", operator: "count", args: [] }],
  breakouts: [
    {
      type: "column",
      fieldId: PEOPLE.SOURCE,
      sourceFieldId: ORDERS.USER_ID,
    },
    {
      type: "column",
      fieldId: PRODUCTS.CATEGORY,
      sourceFieldId: ORDERS.PRODUCT_ID,
    },
  ],
};

describe("QueryBuilder > bar, row and combo charts", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("with x-axis series", () => {
    function respond(body: unknown) {
      if (!isCountBySourceAndCategory(body)) {
        return EMPTY_DATASET;
      }
      const filters = getFilters(body);
      if (filters.length === 0) {
        return createDataset(
          [USER_SOURCE_COLUMN, PRODUCT_CATEGORY_COLUMN, COUNT_COLUMN],
          createCountBySourceAndCategoryRows(CATEGORIES),
        );
      }
      const [filter] = filters;
      if (
        filters.length === 1 &&
        isCategoryFilter(filter, "!=") &&
        _.isEqual(filter.slice(3), ["Gadget"])
      ) {
        return createDataset(
          [USER_SOURCE_COLUMN, PRODUCT_CATEGORY_COLUMN, COUNT_COLUMN],
          createCountBySourceAndCategoryRows(
            CATEGORIES.filter((category) => category !== "Gadget"),
          ),
        );
      }
      return EMPTY_DATASET;
    }

    it("should allow you to show/hide and reorder columns, and handle filtered and re-added items", async () => {
      setupFieldValuesEndpoint(
        createMockFieldValues({
          field_id: Number(PRODUCTS.CATEGORY),
          values: CATEGORIES.map((category) => [category]),
        }),
      );
      await setupAdhocQuestion({
        card: createMockUnsavedCard({
          display: "bar",
          displayIsLocked: true,
          visualization_settings: {},
          dataset_query: createStructuredQuery(
            COUNT_BY_SOURCE_AND_CATEGORY_STAGE,
          ),
        }),
        respond,
      });
      const chart = await getChart();
      await openVizSettings();
      await openSettingsTab("Data");
      mockItemRects();
      expect(getDraggableItemNames()).toEqual(CATEGORIES);

      // move Doohickey to the third position
      await dragItem({ from: 0, to: 2 });
      await waitFor(() =>
        expect(getLegendItemNames()).toEqual([
          "Gadget",
          "Gizmo",
          "Doohickey",
          "Widget",
        ]),
      );

      // hide Gizmo
      await removeDraggableItem("Gizmo");
      await waitFor(() =>
        expect(
          within(getVisualizationRoot()).queryByText("Gizmo"),
        ).not.toBeInTheDocument(),
      );
      expect(getLegendItemNames()).toEqual(["Gadget", "Doohickey", "Widget"]);
      expectVisibleBar(chart, CATEGORY_COLORS.Widget);
      expectVisibleBar(chart, CATEGORY_COLORS.Gadget);
      expectVisibleBar(chart, CATEGORY_COLORS.Doohickey);
      expect(getPathsWithFill(chart, CATEGORY_COLORS.Gizmo)).toHaveLength(0);

      // add Gizmo again
      await addAnotherSeries("Gizmo");
      await waitFor(() =>
        expect(
          within(getVisualizationRoot()).getByText("Gizmo"),
        ).toBeInTheDocument(),
      );
      expect(getLegendItemNames()).toHaveLength(4);
      expectVisibleBar(chart, CATEGORY_COLORS.Widget);
      expectVisibleBar(chart, CATEGORY_COLORS.Gadget);
      expectVisibleBar(chart, CATEGORY_COLORS.Doohickey);
      expectVisibleBar(chart, CATEGORY_COLORS.Gizmo);

      // hide Gizmo again
      expect(getDraggableItemNames()[1]).toBe("Gizmo");
      await removeDraggableItem("Gizmo");

      // filter out Gadget
      expect(getDatasetRequestBodies()).toHaveLength(1);
      await userEvent.click(
        within(screen.getByTestId("qb-header")).getByRole("button", {
          name: /Filter/,
        }),
      );
      await userEvent.click(await screen.findByText("Product"));
      await userEvent.click(await screen.findByText("Category"));
      await userEvent.click(await screen.findByLabelText("Filter operator"));
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Is not" }),
      );
      await userEvent.click(
        await screen.findByRole("checkbox", { name: "Gadget" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Apply filter" }),
      );
      await waitFor(() =>
        expect(getDraggableItemNames()).toEqual(["Doohickey", "Widget"]),
      );
      const filteredBody = getDatasetRequestBodies().at(-1);
      expect(getFilters(filteredBody)).toHaveLength(1);
      expect(isCategoryFilter(getFilters(filteredBody)[0], "!=")).toBe(true);
      expect(getFilters(filteredBody)[0].slice(3)).toEqual(["Gadget"]);

      // remove the filter
      await userEvent.click(
        within(screen.getByTestId("qb-filters-panel")).getByRole("button", {
          name: "Remove",
        }),
      );
      await waitFor(() =>
        expect(getDraggableItemNames()).toEqual([
          "Gadget",
          "Doohickey",
          "Widget",
        ]),
      );
      expect(getFilters(getDatasetRequestBodies().at(-1))).toEqual([]);

      // add Gizmo to the end of the list
      await addAnotherSeries("Gizmo");
      await waitFor(() =>
        expect(getDraggableItemNames()).toEqual([
          "Gadget",
          "Gizmo",
          "Doohickey",
          "Widget",
        ]),
      );

      // drill through a legend item
      const gadgetLegendItem = screen
        .getAllByTestId("legend-item")
        .find((item) => item.textContent === "Gadget");
      await userEvent.click(
        within(checkNotNull(gadgetLegendItem)).getByText("Gadget"),
      );
      await userEvent.click(await screen.findByText("See these Orders"));
      expect(
        await within(screen.getByTestId("qb-filters-panel")).findByText(
          "Product → Category is Gadget",
        ),
      ).toBeInTheDocument();
      await waitFor(() => {
        const drillBody = getDatasetRequestBodies().at(-1);
        const [filter] = getFilters(drillBody);
        expect(isCategoryFilter(filter, "=")).toBe(true);
      });
      const [drillFilter] = getFilters(getDatasetRequestBodies().at(-1));
      expect(drillFilter.slice(3)).toEqual(["Gadget"]);
    });
  });

  it("supports gray series colors", async () => {
    const GRAY = "#F2F2F3";
    const FIRST_SERIES_COLOR = "#88BF4D";
    await setupAdhocQuestion({
      card: createMockUnsavedCard({
        display: "bar",
        displayIsLocked: true,
        visualization_settings: {
          "graph.dimensions": ["CATEGORY", "SOURCE"],
          "graph.metrics": ["count"],
        },
        dataset_query: createStructuredQuery(
          COUNT_BY_SOURCE_AND_CATEGORY_STAGE,
        ),
      }),
      respond: (body) =>
        isCountBySourceAndCategory(body)
          ? createDataset(
              [USER_SOURCE_COLUMN, PRODUCT_CATEGORY_COLUMN, COUNT_COLUMN],
              createCountBySourceAndCategoryRows(CATEGORIES),
            )
          : EMPTY_DATASET,
    });
    const chart = await getChart();

    // the gray color is not assigned to a series
    await waitFor(() => expectVisibleBar(chart, FIRST_SERIES_COLOR));
    expect(getPathsWithFill(chart, GRAY)).toHaveLength(0);

    await openVizSettings();
    await userEvent.click(
      within(getSettingsSidebar()).getByLabelText(FIRST_SERIES_COLOR),
    );
    await userEvent.click(await screen.findByLabelText(GRAY));

    await waitFor(() => expectVisibleBar(chart, GRAY));
    expect(getPathsWithFill(chart, FIRST_SERIES_COLOR)).toHaveLength(0);
  });

  it("supports up to 100 series (metabase#28796)", async () => {
    const ID_COLUMN = createOrdersIdDatasetColumn({
      source: "breakout",
      field_ref: ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
    });
    const getIdLimit = (body: unknown) => {
      const filters = getFilters(body);
      const [filter] = filters;
      const isIdLimit =
        filters.length === 1 &&
        filter[0] === "<" &&
        getIn(filter, [2, 2]) === ORDERS.ID;
      return isIdLimit ? filter[3] : undefined;
    };
    const respond = (body: unknown) => {
      const idLimit = getIdLimit(body);
      const isCountByYearAndId =
        isCountOfOrders(body) &&
        getStage(body, ["breakout", 0, 2]) === ORDERS.CREATED_AT &&
        getStage(body, ["breakout", 0, 1, "temporal-unit"]) === "year" &&
        getStage(body, ["breakout", 1, 2]) === ORDERS.ID;
      if (!isCountByYearAndId || typeof idLimit !== "number") {
        return EMPTY_DATASET;
      }
      return createDataset(
        [createCreatedAtColumn("year"), ID_COLUMN, COUNT_COLUMN],
        _.range(1, idLimit).map((id) => [
          `${2025 + (id % 4)}-01-01T00:00:00Z`,
          id,
          1,
        ]),
      );
    };
    await setupAdhocQuestion({
      card: createMockUnsavedCard({
        display: "bar",
        displayIsLocked: true,
        visualization_settings: {
          "graph.dimensions": ["CREATED_AT", "SUBTOTAL"],
          "graph.metrics": ["count"],
        },
        dataset_query: createStructuredQuery({
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "CREATED_AT", unit: "year" },
            { type: "column", name: "ID" },
          ],
          filters: [
            {
              type: "operator",
              operator: "<",
              args: [
                { type: "column", name: "ID" },
                { type: "literal", value: 101 },
              ],
            },
          ],
        }),
      }),
      respond,
    });
    await getChart();

    await openVizSettings();
    await userEvent.click(
      within(getSettingsSidebar()).getByRole("button", {
        name: "90 more series",
      }),
    );
    expect(getDraggableItems()).toHaveLength(100);

    await userEvent.click(screen.getByText("ID is less than 101"));
    const input = await screen.findByDisplayValue("101");
    await userEvent.type(input, "{backspace}2");
    await userEvent.click(
      screen.getByRole("button", { name: "Update filter" }),
    );

    expect(
      await screen.findByText(
        "This chart type doesn't support more than 100 series of data.",
      ),
    ).toBeInTheDocument();
    expect(getIdLimit(getDatasetRequestBodies().at(-1))).toBe(102);
    expect(getDraggableItems()).toHaveLength(0);
  });

  it("should not display duplicate Y-axis after modifying/reordering metrics (metabase#20548)", async () => {
    const SUM_COLUMN = createAggregationColumn(
      "sum",
      "Sum of Price",
      0,
      "type/Float",
    );
    const CATEGORY_COLUMN = createProductsCategoryDatasetColumn({
      source: "breakout",
    });
    const SUMS = [2185.89, 3009.94, 2834.88, 3109.31];
    const COUNTS = [42, 53, 51, 54];
    const card = createMockCard({
      id: 20548,
      name: "20548",
      display: "bar",
      // the metrics are in the reverse order of the aggregations
      visualization_settings: {
        "graph.metrics": ["count", "sum"],
        "graph.dimensions": ["CATEGORY"],
      },
      dataset_query: createStructuredQuery({
        source: { type: "table", id: PRODUCTS_ID },
        aggregations: [
          {
            type: "operator",
            operator: "sum",
            args: [{ type: "column", name: "PRICE" }],
          },
          { type: "operator", operator: "count", args: [] },
        ],
        breakouts: [{ type: "column", name: "CATEGORY" }],
      }),
    });
    const isSumOfPrice = (body: unknown, index: number) =>
      getStage(body, ["aggregation", index, 0]) === "sum" &&
      getStage(body, ["aggregation", index, 2, 2]) === PRODUCTS.PRICE;
    const isByCategory = (body: unknown) =>
      getIn(body, ["database"]) === SAMPLE_DB_ID &&
      getStage(body, ["source-table"]) === PRODUCTS_ID &&
      getStage(body, ["breakout", "length"]) === 1 &&
      getStage(body, ["breakout", 0, 2]) === PRODUCTS.CATEGORY;
    const respond = (body: unknown) => {
      const aggregationCount = getStage(body, ["aggregation", "length"]);
      if (!isByCategory(body) || !isSumOfPrice(body, 0)) {
        return EMPTY_DATASET;
      }
      if (aggregationCount === 1) {
        return createDataset(
          [CATEGORY_COLUMN, SUM_COLUMN],
          CATEGORIES.map((category, index) => [category, SUMS[index]]),
        );
      }
      if (
        aggregationCount === 2 &&
        getStage(body, ["aggregation", 1, 0]) === "count"
      ) {
        return createDataset(
          [
            CATEGORY_COLUMN,
            SUM_COLUMN,
            createAggregationColumn("count", "Count", 1),
          ],
          CATEGORIES.map((category, index) => [
            category,
            SUMS[index],
            COUNTS[index],
          ]),
        );
      }
      return EMPTY_DATASET;
    };
    await setup({
      card,
      database: SAMPLE_DATABASE_WITH_AUTO_RUN,
      dataset: createDataset(
        [
          CATEGORY_COLUMN,
          SUM_COLUMN,
          createAggregationColumn("count", "Count", 1),
        ],
        CATEGORIES.map((category, index) => [
          category,
          SUMS[index],
          COUNTS[index],
        ]),
      ),
    });
    fetchMock.modifyRoute("dataset-post", {
      response: (call: CallLog) => respond(getRequestBody(call)),
    });
    const chart = await getChart();
    await userEvent.click(screen.getByRole("button", { name: /Summarize/ }));

    await userEvent.click(await screen.findByLabelText("Remove Count"));
    // bars of only one series
    await waitFor(() =>
      expect(getPathsWithFill(chart, "#509EE3")).toHaveLength(0),
    );
    expect(getPathsWithFill(chart, "#88BF4D")).toHaveLength(4);
    expect(
      getStage(getDatasetRequestBodies().at(-1), ["aggregation", "length"]),
    ).toBe(1);

    await addCountOfRows();
    // bars of two series
    await waitFor(() =>
      expect(getPathsWithFill(chart, "#509EE3")).toHaveLength(4),
    );
    expect(getPathsWithFill(chart, "#88BF4D")).toHaveLength(4);
    expect(
      getStage(getDatasetRequestBodies().at(-1), ["aggregation", "length"]),
    ).toBe(2);
    expect(
      getLegendItemNames().filter((name) => name === "Count"),
    ).toHaveLength(1);
    expect(
      getLegendItemNames().filter((name) => name === "Sum of Price"),
    ).toHaveLength(1);

    await openVizSettings();
    expect(
      within(getSettingsSidebar()).getByDisplayValue("Count"),
    ).toBeInTheDocument();
  });

  it("should show error when adding high-cardinality breakout via UI (metabase#64086)", async () => {
    const ID_COLUMN = createOrdersIdDatasetColumn({
      source: "breakout",
      field_ref: ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
    });
    const MINUTE_COLUMN = createOrdersCreatedAtDatasetColumn({
      source: "breakout",
      unit: "minute",
      display_name: "Created At: Minute",
      field_ref: [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "minute" },
      ],
    });
    const ORDER_COUNT = 101;
    await setupAdhocQuestion({
      card: createMockUnsavedCard({
        display: "row",
        displayIsLocked: true,
        visualization_settings: {
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["count"],
        },
        dataset_query: createStructuredQuery({
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "CREATED_AT", unit: "minute" },
            { type: "column", name: "ID" },
          ],
        }),
      }),
      respond: (body) =>
        isCountOfOrders(body) &&
        getStage(body, ["breakout", 0, 1, "temporal-unit"]) === "minute" &&
        getStage(body, ["breakout", 1, 2]) === ORDERS.ID
          ? createDataset(
              [MINUTE_COLUMN, ID_COLUMN, COUNT_COLUMN],
              _.range(1, ORDER_COUNT + 1).map((id) => [
                `2026-01-01T00:${String(id % 60).padStart(2, "0")}:00Z`,
                id,
                1,
              ]),
            )
          : EMPTY_DATASET,
    });
    await getChart();
    expect(
      screen.queryByText(
        "This chart type doesn't support more than 100 series of data.",
      ),
    ).not.toBeInTheDocument();

    await openVizSettings();
    await openSettingsTab("Data");
    await userEvent.click(
      within(getSettingsSidebar()).getByText("Add series breakout"),
    );

    expect(
      await screen.findByText(
        "This chart type doesn't support more than 100 series of data.",
      ),
    ).toBeInTheDocument();
    // a viz setting, so the query does not run again
    expect(getDatasetRequestBodies()).toHaveLength(1);
  });

  it("should support stacking on a combo chart", async () => {
    const METRICS: [string, string, number[]][] = [
      ["avg", "Average of Total", [56.66, 76.35, 79.16, 79.81, 80.2]],
      ["avg_2", "Average of Subtotal", [54.44, 73.11, 75.81, 76.38, 76.79]],
      ["min", "Min of Total", [12.324, 12.03, 13.17, 12.94, 12.45]],
      ["min_2", "Min of Subtotal", [15.692, 15.69, 15.69, 15.69, 15.69]],
      ["max", "Max of Total", [102.77, 154.26, 157.71, 159.35, 158.42]],
      ["max_2", "Max of Subtotal", [98.82, 148.23, 148.23, 148.23, 148.23]],
    ];
    const YEARS = [2025, 2026, 2027, 2028, 2029];
    const cols = [
      createCreatedAtColumn("year"),
      ...METRICS.map(([name, displayName], index) =>
        createAggregationColumn(name, displayName, index, "type/Float"),
      ),
    ];
    const isSixMetricsByYear = (body: unknown) =>
      getIn(body, ["database"]) === SAMPLE_DB_ID &&
      getStage(body, ["source-table"]) === ORDERS_ID &&
      getStage(body, ["aggregation", "length"]) === METRICS.length &&
      getStage(body, ["breakout", 0, 1, "temporal-unit"]) === "year";
    await setupAdhocQuestion({
      card: createMockUnsavedCard({
        display: "combo",
        displayIsLocked: true,
        visualization_settings: {
          "graph.show_values": true,
          series_settings: {
            // an area stack of two series
            min_2: { display: "area" },
            min: { display: "area" },
          },
        },
        dataset_query: createStructuredQuery({
          source: { type: "table", id: ORDERS_ID },
          aggregations: (
            [
              ["avg", "TOTAL"],
              ["avg", "SUBTOTAL"],
              ["min", "TOTAL"],
              ["min", "SUBTOTAL"],
              ["max", "TOTAL"],
              ["max", "SUBTOTAL"],
            ] as const
          ).map(([operator, name]) => ({
            type: "operator",
            operator,
            args: [{ type: "column", name }],
          })),
          breakouts: [{ type: "column", name: "CREATED_AT", unit: "year" }],
        }),
      }),
      respond: (body) =>
        isSixMetricsByYear(body)
          ? createDataset(
              cols,
              YEARS.map((year, index) => [
                `${year}-01-01T00:00:00Z`,
                ...METRICS.map(([, , values]) => values[index]),
              ]),
            )
          : EMPTY_DATASET,
    });
    const chart = await getChart();
    await openVizSettings();
    await openSettingsTab("Display");
    await userEvent.click(within(getSettingsSidebar()).getByText("Stack"));

    await waitFor(() =>
      expect(getValueLabels(chart).length).toBeGreaterThan(0),
    );

    // the first point of the line series
    hoverChartElement(chart, isSymbolWithStroke("#A989C5"), 0);
    await waitFor(() =>
      expect(getEChartsTooltipHeader()).toHaveTextContent(/^2025$/),
    );
    expect(getTooltipRows(getEChartsTooltip())).toEqual([
      { color: "#A989C5", name: "Average of Total", value: "56.66" },
      { color: "#F2A86F", name: "Average of Subtotal", value: "54.44" },
      { color: "#EF8C8C", name: "Min of Total", value: "12.32" },
      { color: "#98D9D9", name: "Min of Subtotal", value: "15.69" },
      { color: "#F9D45C", name: "Max of Total", value: "102.77" },
      { color: "#7172AD", name: "Max of Subtotal", value: "98.82" },
    ]);
    unhoverChart(chart);

    // the first point of the stacked area series shows only the area stack,
    // top first
    hoverChartElement(chart, isSymbolWithStroke("#98D9D9"), 0);
    await waitFor(() =>
      expect(getTooltipRows(getEChartsTooltip())).toEqual([
        {
          color: "#98D9D9",
          name: "Min of Subtotal",
          value: "15.69",
          secondaryValue: "56.01 %",
        },
        {
          color: "#EF8C8C",
          name: "Min of Total",
          value: "12.32",
          secondaryValue: "43.99 %",
        },
        { name: "Total", value: "28.02", secondaryValue: "100 %" },
      ]),
    );
    expect(getEChartsTooltipHeader()).toHaveTextContent(/^2025$/);
    unhoverChart(chart);

    // the first bar of the stacked bar series shows only the bar stack
    hoverChartElement(chart, withFill("#7172AD"), 0);
    await waitFor(() =>
      expect(getTooltipRows(getEChartsTooltip())).toEqual([
        {
          color: "#7172AD",
          name: "Max of Subtotal",
          value: "98.82",
          secondaryValue: "38.60 %",
        },
        {
          color: "#F9D45C",
          name: "Max of Total",
          value: "102.77",
          secondaryValue: "40.14 %",
        },
        {
          color: "#F2A86F",
          name: "Average of Subtotal",
          value: "54.44",
          secondaryValue: "21.26 %",
        },
        { name: "Total", value: "256.03", secondaryValue: "100 %" },
      ]),
    );
    expect(getEChartsTooltipHeader()).toHaveTextContent(/^2025$/);

    expect(getChartTexts(chart)).not.toContain("100%");
    await userEvent.click(
      within(getSettingsSidebar()).getByText("Stack - 100%"),
    );
    // the y-axis has a 100% tick
    await waitFor(() => expect(getChartTexts(chart)).toContain("100%"));
  });

  it("should allow selecting breakout dimension before metrics (metabase#49529)", async () => {
    const cols = createOrdersTableDatasetColumns();
    await setupAdhocQuestion({
      card: createMockUnsavedCard({
        display: "bar",
        displayIsLocked: true,
        visualization_settings: {},
        dataset_query: createStructuredQuery({
          source: { type: "table", id: ORDERS_ID },
        }),
      }),
      respond: (body) =>
        getStage(body, ["source-table"]) === ORDERS_ID &&
        getStage(body, ["aggregation"]) == null
          ? createDataset(
              cols,
              [1, 2, 3].map((id) =>
                cols.map((col) =>
                  col.name === "CREATED_AT"
                    ? `2026-0${id}-01T00:00:00Z`
                    : id * 10,
                ),
              ),
            )
          : EMPTY_DATASET,
    });
    await openVizSettings();

    const [xAxisSelect] = within(getSettingsSidebar()).getAllByTestId(
      "chart-setting-select",
    );
    await userEvent.click(xAxisSelect);
    await userEvent.click(await screen.findByRole("option", { name: "ID" }));
    await userEvent.click(
      within(getSettingsSidebar()).getByText("Add series breakout"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Quantity" }),
    );

    expect(
      await within(getSettingsSidebar()).findByText("Y-axis"),
    ).toBeInTheDocument();
    expect(
      within(getSettingsSidebar()).getByText("Nothing to order"),
    ).toBeInTheDocument();
  });
});
