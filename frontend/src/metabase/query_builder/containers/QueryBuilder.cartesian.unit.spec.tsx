import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";
import _ from "underscore";

import {
  countChartElements,
  expectTooltip,
  getChartRoot,
  hoverChartElement,
} from "__support__/echarts-interaction";
import {
  act,
  mockGetBoundingClientRect,
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
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
  createProductsCategoryDatasetColumn,
  createProductsRatingDatasetColumn,
} from "metabase-types/api/mocks/presets";

import { setup, waitForQueryToStart } from "./test-utils";

registerVisualizations();

const CATEGORY_COLORS = {
  Doohickey: "#88BF4D",
  Gadget: "#F9D45C",
  Gizmo: "#A989C5",
  Widget: "#F2A86F",
};
type Category = keyof typeof CATEGORY_COLORS;
const CATEGORIES: Category[] = ["Doohickey", "Gadget", "Gizmo", "Widget"];

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

const CREATED_AT_YEAR_COLUMN = createOrdersCreatedAtDatasetColumn({
  source: "breakout",
  unit: "year",
  display_name: "Created At: Year",
  field_ref: [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime", "temporal-unit": "year" },
  ],
});

const CREATED_AT_MONTH_COLUMN = createOrdersCreatedAtDatasetColumn({
  source: "breakout",
  unit: "month",
  display_name: "Created At: Month",
  field_ref: [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime", "temporal-unit": "month" },
  ],
});

const PRODUCT_CATEGORY_COLUMN = createProductsCategoryDatasetColumn({
  source: "breakout",
  display_name: "Product → Category",
  fk_field_id: ORDERS.PRODUCT_ID,
  field_ref: [
    "field",
    PRODUCTS.CATEGORY,
    { "source-field": ORDERS.PRODUCT_ID },
  ],
});

const PRODUCT_RATING_COLUMN = createProductsRatingDatasetColumn({
  source: "breakout",
  display_name: "Product → Rating",
  fk_field_id: ORDERS.PRODUCT_ID,
  field_ref: ["field", PRODUCTS.RATING, { "source-field": ORDERS.PRODUCT_ID }],
});

function createDataset(cols: DatasetColumn[], rows: RowValue[][]): Dataset {
  return createMockDataset({
    data: createMockDatasetData({ cols, rows }),
    row_count: rows.length,
  });
}

const EMPTY_DATASET = createDataset([], []);

function createStructuredQuery(stage: TestStageWithSourceSpec) {
  return Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, { stages: [stage] }),
  );
}

const COUNT = { type: "operator", operator: "count", args: [] } as const;
const sumOf = (name: string) =>
  ({
    type: "operator",
    operator: "sum",
    args: [{ type: "column", name }],
  }) as const;

function removeUuids(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUuids);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "lib/uuid")
        .map(([key, item]) => [key, removeUuids(item)]),
    );
  }
  return value;
}

function getStages(query: unknown) {
  return typeof query === "object" && query !== null && "stages" in query
    ? removeUuids(query.stages)
    : undefined;
}

/**
 * Opens an ad-hoc question. POST /api/dataset returns the rows only for the
 * card's own query, on the sample database, and no rows for any other query.
 */
async function setupAdhocQuestion(card: UnsavedCard, dataset: Dataset) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  const result = await setup({
    card,
    // keeps the display the card asks for, as a locked display in the URL does
    initialRoute: `/question#${serializeCardForUrl(card, { includeDisplayIsLocked: true })}`,
    waitForLoad: false,
  });
  fetchMock.modifyRoute("dataset-post", {
    response: (call: CallLog) => {
      const body: unknown = JSON.parse(String(call.options.body));
      const isCardQuery =
        typeof body === "object" &&
        body !== null &&
        "database" in body &&
        body.database === SAMPLE_DB_ID &&
        _.isEqual(getStages(body), getStages(card.dataset_query));
      return isCardQuery ? dataset : EMPTY_DATASET;
    },
  });
  await waitForLoaderToBeRemoved();
  await waitForQueryToStart();
  await waitFor(() =>
    expect(fetchMock.callHistory.calls("dataset-post")).toHaveLength(1),
  );
  await act(() => fetchMock.callHistory.flush(true));
  return result;
}

async function findChart() {
  const chart = getChartRoot(await screen.findByTestId("chart-container"));
  // eslint-disable-next-line testing-library/no-node-access -- the chart is drawn in an svg without a role
  await waitFor(() => expect(chart.querySelector("svg path")).not.toBeNull());
  return chart;
}

const getSettingsSidebar = () => screen.getByTestId("chartsettings-sidebar");

async function openSettingsTab(name: string) {
  await userEvent.click(
    within(getSettingsSidebar()).getByRole("tab", { name }),
  );
}

function getLegendItem(name: string) {
  return checkNotNull(
    screen
      .getAllByTestId("legend-item")
      .find((item) => within(item).queryByText(name) != null),
  );
}

async function toggleSeries(
  name: Category,
  label: "Hide series" | "Show series",
) {
  await userEvent.click(
    within(getLegendItem(name)).getByRole("button", { name: label }),
  );
}

async function expectBarsByCategory(
  chart: HTMLElement,
  expected: Record<Category, number>,
) {
  await waitFor(() =>
    expect(
      Object.fromEntries(
        CATEGORIES.map((category) => [
          category,
          countChartElements(chart, {
            type: "rect",
            color: CATEGORY_COLORS[category],
          }),
        ]),
      ),
    ).toEqual(expected),
  );
}

const doohickeyBar = (index: number) => ({
  type: "rect" as const,
  color: CATEGORY_COLORS.Doohickey,
  index,
});

describe("QueryBuilder > cartesian charts", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("tooltips", () => {
    const RATINGS = [0, 1];
    // [count, sum of total, average of quantity] by rating and category
    const VALUES: Record<Category, [number, number, number][]> = {
      Doohickey: [
        [100, 9000, 3.5],
        [192, 20345.44, 3.76],
      ],
      Gadget: [
        [200, 18000, 3.6],
        [653, 54000, 3.8],
      ],
      Gizmo: [
        [300, 27000, 3.7],
        [370, 31000, 3.86],
      ],
      Widget: [
        [400, 36000, 3.8],
        [1093, 74417.19, 3.9],
      ],
    };

    const CARD = createMockUnsavedCard({
      display: "bar",
      displayIsLocked: true,
      dataset_query: createStructuredQuery({
        source: { type: "table", id: ORDERS_ID },
        aggregations: [
          COUNT,
          sumOf("TOTAL"),
          {
            type: "operator",
            operator: "avg",
            args: [{ type: "column", name: "QUANTITY" }],
          },
        ],
        breakouts: [
          {
            type: "column",
            fieldId: PRODUCTS.RATING,
            sourceFieldId: ORDERS.PRODUCT_ID,
          },
          {
            type: "column",
            fieldId: PRODUCTS.CATEGORY,
            sourceFieldId: ORDERS.PRODUCT_ID,
          },
        ],
      }),
      visualization_settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.dimensions": ["RATING"],
        "graph.metrics": ["count"],
      },
    });

    const DATASET = createDataset(
      [
        PRODUCT_RATING_COLUMN,
        PRODUCT_CATEGORY_COLUMN,
        createAggregationColumn("count", "Count", 0),
        createAggregationColumn("sum", "Sum of Total", 1, "type/Float"),
        createAggregationColumn("avg", "Average of Quantity", 2, "type/Float"),
      ],
      RATINGS.flatMap((rating, ratingIndex) =>
        CATEGORIES.map((category) => [
          rating,
          category,
          ...VALUES[category][ratingIndex],
        ]),
      ),
    );

    it("adds non-series columns to the tooltip, and keeps them with a series breakout and stacking", async () => {
      await setupAdhocQuestion(CARD, DATASET);
      const chart = await findChart();

      // the second rating, so a tooltip of the first one cannot pass
      await hoverChartElement(chart, {
        type: "rect",
        color: "#509EE3",
        index: 1,
      });
      await expectTooltip({ header: "1", rows: ["#509EE3 | Count | 2,308"] });

      await userEvent.click(screen.getByTestId("viz-settings-button"));
      await openSettingsTab("Display");
      await userEvent.click(
        within(getSettingsSidebar()).getByPlaceholderText("Enter column names"),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "Sum of Total" }),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "Average of Quantity" }),
      );
      // categorical columns can go in the tooltip too
      expect(
        screen.getByRole("option", { name: "Product → Category" }),
      ).toBeInTheDocument();

      await hoverChartElement(chart, {
        type: "rect",
        color: "#509EE3",
        index: 1,
      });
      await expectTooltip({
        header: "1",
        rows: [
          "#509EE3 | Count | 2,308",
          "Sum of Total | 179,762.63",
          "Average of Quantity | 15.32",
        ],
      });

      await openSettingsTab("Data");
      await userEvent.click(
        within(getSettingsSidebar()).getByText("Add series breakout"),
      );
      const breakoutTooltip = {
        header: "1",
        rows: [
          "#88BF4D | Doohickey | 192",
          "Sum of Total | 20,345.44",
          "Average of Quantity | 3.76",
          "#F9D45C | Gadget | 653",
          "#A989C5 | Gizmo | 370",
          "#F2A86F | Widget | 1,093",
        ],
      };
      await hoverChartElement(chart, doohickeyBar(1));
      await expectTooltip(breakoutTooltip);

      await openSettingsTab("Display");
      await userEvent.click(within(getSettingsSidebar()).getByText("Stack"));
      await hoverChartElement(chart, doohickeyBar(1));
      await expectTooltip({
        header: "1",
        rows: [
          "#88BF4D | Doohickey | 192 | 8.32 %",
          "Sum of Total | 20,345.44",
          "Average of Quantity | 3.76",
          "#F9D45C | Gadget | 653 | 28.29 %",
          "#A989C5 | Gizmo | 370 | 16.03 %",
          "#F2A86F | Widget | 1,093 | 47.36 %",
        ],
        footer: "Total | 2,308 | 100 %",
      });
    });
  });

  describe("legend", () => {
    const YEARS = ["2025", "2026"];
    const COUNTS: Record<Category, number[]> = {
      Doohickey: [177, 600],
      Gadget: [199, 700],
      Gizmo: [158, 650],
      Widget: [210, 710],
    };

    const CARD = createMockUnsavedCard({
      display: "bar",
      displayIsLocked: true,
      dataset_query: createStructuredQuery({
        source: { type: "table", id: ORDERS_ID },
        aggregations: [COUNT],
        breakouts: [
          { type: "column", name: "CREATED_AT", unit: "year" },
          {
            type: "column",
            fieldId: PRODUCTS.CATEGORY,
            sourceFieldId: ORDERS.PRODUCT_ID,
          },
        ],
      }),
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "CATEGORY"],
        "graph.metrics": ["count"],
      },
    });

    const DATASET = createDataset(
      [
        CREATED_AT_YEAR_COLUMN,
        PRODUCT_CATEGORY_COLUMN,
        createAggregationColumn("count", "Count", 0),
      ],
      YEARS.flatMap((year, yearIndex) =>
        CATEGORIES.map((category) => [
          `${year}-01-01T00:00:00Z`,
          category,
          COUNTS[category][yearIndex],
        ]),
      ),
    );

    it("hides series, but not the last one, and leaves hidden series out of a 100% stack", async () => {
      await setupAdhocQuestion(CARD, DATASET);
      const chart = await findChart();
      await expectBarsByCategory(chart, {
        Doohickey: 2,
        Gadget: 2,
        Gizmo: 2,
        Widget: 2,
      });

      await toggleSeries("Gadget", "Hide series");
      await toggleSeries("Gizmo", "Hide series");
      await expectBarsByCategory(chart, {
        Doohickey: 2,
        Gadget: 0,
        Gizmo: 0,
        Widget: 2,
      });
      await hoverChartElement(chart, doohickeyBar(1));
      await expectTooltip({
        header: "2026",
        rows: [
          "#88BF4D | Doohickey | 600 | +238.98%",
          "#F2A86F | Widget | 710 | +238.1%",
        ],
      });

      await toggleSeries("Widget", "Hide series");
      await toggleSeries("Doohickey", "Hide series");
      await expectBarsByCategory(chart, {
        Doohickey: 2,
        Gadget: 0,
        Gizmo: 0,
        Widget: 0,
      });

      await toggleSeries("Gadget", "Show series");
      await expectBarsByCategory(chart, {
        Doohickey: 2,
        Gadget: 2,
        Gizmo: 0,
        Widget: 0,
      });
      await toggleSeries("Gizmo", "Show series");
      await toggleSeries("Widget", "Show series");

      await userEvent.click(screen.getByTestId("viz-settings-button"));
      await openSettingsTab("Display");
      await userEvent.click(
        within(getSettingsSidebar()).getByText("Stack - 100%"),
      );
      await hoverChartElement(chart, doohickeyBar(1));
      await expectTooltip({
        header: "2026",
        rows: [
          "#88BF4D | Doohickey | 600 | 22.56 %",
          "#F9D45C | Gadget | 700 | 26.32 %",
          "#A989C5 | Gizmo | 650 | 24.44 %",
          "#F2A86F | Widget | 710 | 26.69 %",
        ],
        footer: "Total | 2,660 | 100 %",
      });

      await toggleSeries("Gizmo", "Hide series");
      await toggleSeries("Widget", "Hide series");
      await hoverChartElement(chart, doohickeyBar(1));
      await expectTooltip({
        header: "2026",
        rows: [
          "#88BF4D | Doohickey | 600 | 46.15 %",
          "#F9D45C | Gadget | 700 | 53.85 %",
        ],
        footer: "Total | 1,300 | 100 %",
      });
    });

    it.each([
      { display: "line" as const, name: "cartesian" },
      { display: "row" as const, name: "row" },
    ])(
      "does not open a question when the legend item of an aggregation of a $name chart is clicked (metabase#43077)",
      async ({ display }) => {
        const card = createMockUnsavedCard({
          display,
          displayIsLocked: true,
          dataset_query: createStructuredQuery({
            source: { type: "table", id: ORDERS_ID },
            aggregations: [sumOf("QUANTITY"), sumOf("TOTAL")],
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          }),
        });
        const { router } = await setupAdhocQuestion(
          card,
          createDataset(
            [
              CREATED_AT_MONTH_COLUMN,
              createAggregationColumn("sum", "Sum of Quantity", 0),
              createAggregationColumn("sum_2", "Sum of Total", 1, "type/Float"),
            ],
            [
              ["2025-04-01T00:00:00Z", 27, 52.76],
              ["2025-05-01T00:00:00Z", 230, 1265.72],
            ],
          ),
        );
        const legendItem = await screen.findByText("Sum of Total", {
          selector: "[data-testid=legend-item] *",
        });

        // the title, as a click on the dot hides the series
        await userEvent.click(legendItem);
        await act(() => fetchMock.callHistory.flush(true));

        expect(router.location.pathname).toBe("/question");
        expect(
          fetchMock.callHistory
            .calls()
            .filter((call) =>
              new URL(call.url).pathname.startsWith("/api/card"),
            ),
        ).toEqual([]);
      },
    );
  });
});
