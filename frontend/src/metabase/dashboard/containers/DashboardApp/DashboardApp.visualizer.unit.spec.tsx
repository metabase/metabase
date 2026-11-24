import userEvent from "@testing-library/user-event";
import { getInstanceByDom } from "echarts/core";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  setupBookmarksEndpoints,
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupLastDownloadFormatEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  type TestRouter,
  act,
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  resetMockExplicitSize,
  setMockExplicitSize,
} from "metabase/common/components/ExplicitSize/tests/mock-size";
import { deserializeCardFromUrl } from "metabase/common/utils/card";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { GOAL_LINE_DASH, TREND_LINE_DASH } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { SimpleEventSchema } from "metabase-types/analytics";
import type {
  Card,
  CardId,
  Dashboard,
  DashboardCard,
  Dataset,
  DatasetColumn,
  Field,
  FieldId,
  OpaqueDatasetQuery,
  TableId,
  TestBreakoutSpec,
  VisualizerColumnValueSource,
  VisualizerDashboardCard,
} from "metabase-types/api";
import { isCardDisplayType } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCategoryColumn,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDataset,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockField,
  createMockInsight,
  createMockNumericColumn,
  createMockSearchResult,
  createMockVisualizerDashboardCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

registerVisualizations();
registerDashboardVisualizations();

const DASHBOARD_ID = 10;
const DATABASE = createSampleDatabase();
const METADATA = createMockMetadata({ databases: [DATABASE] });
const STRUCTURED_QUERY = Lib.toJsQuery(
  Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
);

const COUNT = { type: "operator", operator: "count", args: [] } as const;

const countByQuery = (
  tableId: TableId,
  breakout: TestBreakoutSpec,
): OpaqueDatasetQuery =>
  Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: tableId },
        aggregations: [COUNT],
        breakouts: [breakout],
      },
    ],
  });

const createdAtColumn = (fieldId: FieldId) =>
  createMockDatetimeColumn({
    id: fieldId,
    name: "CREATED_AT",
    display_name: "Created At: Month",
    unit: "month",
    source: "breakout",
    field_ref: ["field", fieldId, { "temporal-unit": "month" }],
  });
const countColumn = createMockNumericColumn({
  id: undefined,
  name: "count",
  display_name: "Count",
  source: "aggregation",
});
const ordersCategoryColumn = createMockCategoryColumn({
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
const productsCategoryColumn = createMockCategoryColumn({
  id: PRODUCTS.CATEGORY,
  name: "CATEGORY",
  display_name: "Category",
  source: "breakout",
  field_ref: ["field", PRODUCTS.CATEGORY, null],
});

const ORDERS_BY_CREATED_AT = createMockCard({
  id: 1,
  name: "Orders by Created At (Month)",
  display: "line",
  dataset_query: countByQuery(ORDERS_ID, {
    type: "column",
    fieldId: ORDERS.CREATED_AT,
    unit: "month",
  }),
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
});
const PRODUCTS_BY_CREATED_AT = createMockCard({
  id: 2,
  name: "Products by Created At (Month)",
  display: "bar",
  dataset_query: countByQuery(PRODUCTS_ID, {
    type: "column",
    fieldId: PRODUCTS.CREATED_AT,
    unit: "month",
  }),
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
});
const ORDERS_BY_CATEGORY = createMockCard({
  id: 3,
  name: "Orders by Product Category",
  display: "bar",
  dataset_query: countByQuery(ORDERS_ID, {
    type: "column",
    fieldId: PRODUCTS.CATEGORY,
    sourceFieldId: ORDERS.PRODUCT_ID,
  }),
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
});
const PRODUCTS_BY_CATEGORY = createMockCard({
  id: 4,
  name: "Products by Category",
  display: "bar",
  dataset_query: countByQuery(PRODUCTS_ID, {
    type: "column",
    fieldId: PRODUCTS.CATEGORY,
  }),
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
});
const STEP_COLUMN = createMockCard({
  id: 5,
  name: "Step Column",
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.nativeQuery(
      DATABASE.id,
      SAMPLE_PROVIDER,
      "SELECT 'Landing page' AS \"Step\" UNION ALL SELECT 'Checkout page' UNION ALL SELECT 'Payment done page'",
    ),
  ),
});
const VIEWS_COLUMN = createMockCard({
  id: 6,
  name: "Views Column",
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.nativeQuery(
      DATABASE.id,
      SAMPLE_PROVIDER,
      'SELECT 1000 AS "Views" UNION ALL SELECT 600 UNION ALL SELECT 100',
    ),
  ),
});
const ORDERS_TABLE = createMockCard({
  id: 7,
  name: "Orders",
  display: "table",
  dataset_query: STRUCTURED_QUERY,
});

const timeseriesDataset = (
  counts: [number, number, number],
  fieldId: FieldId = ORDERS.CREATED_AT,
) =>
  createMockDataset({
    data: createMockDatasetData({
      cols: [createdAtColumn(fieldId), countColumn],
      rows: [
        ["2024-01-01T00:00:00Z", counts[0]],
        ["2024-02-01T00:00:00Z", counts[1]],
        ["2024-03-01T00:00:00Z", counts[2]],
      ],
      // the backend computes insights for a timeseries breakout
      insights: [
        createMockInsight({
          col: countColumn.name,
          unit: "month",
          "best-fit": ["+", counts[0], ["*", counts[1] - counts[0], "x"]],
        }),
      ],
    }),
  });

const categoryDataset = (
  counts: [number, number, number, number],
  categoryColumn: DatasetColumn,
) =>
  createMockDataset({
    data: createMockDatasetData({
      cols: [categoryColumn, countColumn],
      rows: [
        ["Doohickey", counts[0]],
        ["Gadget", counts[1]],
        ["Gizmo", counts[2]],
        ["Widget", counts[3]],
      ],
    }),
  });

const ordersTableColumns: DatasetColumn[] = [
  createMockNumericColumn({
    id: 201,
    name: "ID",
    display_name: "ID",
    semantic_type: "type/PK",
    source: "fields",
  }),
  createMockNumericColumn({
    id: 202,
    name: "USER_ID",
    display_name: "User ID",
    semantic_type: "type/FK",
    source: "fields",
  }),
  createMockNumericColumn({
    id: 203,
    name: "SUBTOTAL",
    display_name: "Subtotal",
    base_type: "type/Float",
    effective_type: "type/Float",
    source: "fields",
  }),
  createMockNumericColumn({
    id: 204,
    name: "TOTAL",
    display_name: "Total",
    base_type: "type/Float",
    effective_type: "type/Float",
    source: "fields",
  }),
];

const DATASETS: Record<CardId, Dataset> = {
  [ORDERS_BY_CREATED_AT.id]: timeseriesDataset([10, 20, 30]),
  [PRODUCTS_BY_CREATED_AT.id]: timeseriesDataset(
    [4, 5, 6],
    PRODUCTS.CREATED_AT,
  ),
  [ORDERS_BY_CATEGORY.id]: categoryDataset([1, 2, 3, 4], ordersCategoryColumn),
  [PRODUCTS_BY_CATEGORY.id]: categoryDataset(
    [5, 6, 7, 8],
    productsCategoryColumn,
  ),
  [STEP_COLUMN.id]: createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockCategoryColumn({
          id: undefined,
          name: "Step",
          display_name: "Step",
          source: "native",
        }),
      ],
      rows: [["Landing page"], ["Checkout page"], ["Payment done page"]],
    }),
  }),
  [VIEWS_COLUMN.id]: createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockNumericColumn({
          id: undefined,
          name: "Views",
          display_name: "Views",
          source: "native",
        }),
      ],
      rows: [[1000], [600], [100]],
    }),
  }),
  [ORDERS_TABLE.id]: createMockDataset({
    data: createMockDatasetData({
      cols: ordersTableColumns,
      rows: [
        [1, 11, 39.72, 42.0],
        [2, 12, 117.03, 120.5],
      ],
    }),
  }),
};

/**
 * A `field_ref` as the backend sends it for aggregation and native columns.
 * Drills map a clicked column back to the query by it.
 */
function getBackendFieldRef(column: DatasetColumn): DatasetColumn["field_ref"] {
  if (column.source === "aggregation") {
    return ["aggregation", 0];
  }
  if (column.source === "native" && column.base_type != null) {
    return ["field", column.name, { "base-type": column.base_type }];
  }
  return column.field_ref;
}

const MONTHS_OF_2024 = Array.from(
  { length: 12 },
  (_, month) => `2024-${String(month + 1).padStart(2, "0")}-01T00:00:00Z`,
);

/** A year of monthly counts, so a brush can span several months */
const PRODUCTS_BY_CREATED_AT_YEAR = createMockDataset({
  data: createMockDatasetData({
    cols: [createdAtColumn(PRODUCTS.CREATED_AT), countColumn],
    rows: MONTHS_OF_2024.map((month, index) => [month, index + 1]),
  }),
});

const DATASETS_WITH_FIELD_REFS: Record<CardId, Dataset> = Object.fromEntries(
  Object.entries({
    ...DATASETS,
    [PRODUCTS_BY_CREATED_AT.id]: PRODUCTS_BY_CREATED_AT_YEAR,
  }).map(([cardId, dataset]) => [
    cardId,
    {
      ...dataset,
      data: {
        ...dataset.data,
        cols: dataset.data.cols.map((column) => ({
          ...column,
          field_ref: getBackendFieldRef(column),
        })),
      },
    },
  ]),
);

function isNativeCard(card: Card) {
  const query = Lib.fromJsQueryAndMetadata(METADATA, card.dataset_query);
  return Lib.queryDisplayInfo(query).isNative;
}

/** A query result column as the search API describes it in `result_metadata` */
const toResultMetadata = (column: DatasetColumn): Field =>
  createMockField({
    id: typeof column.id === "number" ? column.id : undefined,
    name: column.name,
    display_name: column.display_name,
    base_type: column.base_type,
    effective_type: column.effective_type,
    semantic_type: column.semantic_type ?? null,
  });

const columnRef = (
  name: string,
  originalName: string,
  card: Card,
): VisualizerColumnValueSource => ({
  name,
  originalName,
  sourceId: `card:${card.id}`,
});

const MULTI_SERIES_LINE_DASHCARD = createMockVisualizerDashboardCard({
  id: 11,
  dashboard_id: DASHBOARD_ID,
  card_id: ORDERS_BY_CREATED_AT.id,
  card: ORDERS_BY_CREATED_AT,
  series: [PRODUCTS_BY_CREATED_AT],
  row: 0,
  col: 0,
  size_x: 12,
  size_y: 8,
  visualization_settings: {
    visualization: {
      display: "line",
      columnValuesMapping: {
        COLUMN_1: [columnRef("COLUMN_1", "CREATED_AT", ORDERS_BY_CREATED_AT)],
        COLUMN_2: [columnRef("COLUMN_2", "count", ORDERS_BY_CREATED_AT)],
        COLUMN_3: [columnRef("COLUMN_3", "CREATED_AT", PRODUCTS_BY_CREATED_AT)],
        COLUMN_4: [columnRef("COLUMN_4", "count", PRODUCTS_BY_CREATED_AT)],
      },
      settings: {
        "card.title": "My chart",
        "graph.dimensions": ["COLUMN_1", "COLUMN_3"],
        "graph.metrics": ["COLUMN_2", "COLUMN_4"],
      },
    },
  },
});

const MULTI_SERIES_BAR_DASHCARD = createMockVisualizerDashboardCard({
  id: 12,
  dashboard_id: DASHBOARD_ID,
  card_id: ORDERS_BY_CATEGORY.id,
  card: ORDERS_BY_CATEGORY,
  series: [PRODUCTS_BY_CATEGORY],
  row: 0,
  col: 12,
  size_x: 12,
  size_y: 8,
  visualization_settings: {
    visualization: {
      display: "bar",
      columnValuesMapping: {
        COLUMN_1: [columnRef("COLUMN_1", "CATEGORY", ORDERS_BY_CATEGORY)],
        COLUMN_2: [columnRef("COLUMN_2", "count", ORDERS_BY_CATEGORY)],
        COLUMN_3: [columnRef("COLUMN_3", "CATEGORY", PRODUCTS_BY_CATEGORY)],
        COLUMN_4: [columnRef("COLUMN_4", "count", PRODUCTS_BY_CATEGORY)],
      },
      settings: {
        "card.title": "My category chart",
        "graph.dimensions": ["COLUMN_1", "COLUMN_3"],
        "graph.metrics": ["COLUMN_2", "COLUMN_4"],
      },
    },
  },
});

const PIE_DASHCARD = createMockVisualizerDashboardCard({
  id: 13,
  dashboard_id: DASHBOARD_ID,
  card_id: PRODUCTS_BY_CATEGORY.id,
  card: PRODUCTS_BY_CATEGORY,
  series: [],
  row: 8,
  col: 0,
  size_x: 12,
  size_y: 8,
  visualization_settings: {
    visualization: {
      display: "pie",
      columnValuesMapping: {
        COLUMN_1: [columnRef("COLUMN_1", "CATEGORY", PRODUCTS_BY_CATEGORY)],
        COLUMN_2: [columnRef("COLUMN_2", "count", PRODUCTS_BY_CATEGORY)],
      },
      settings: {
        "card.title": "My pie chart",
        "pie.metric": "COLUMN_2",
        "pie.dimension": ["COLUMN_1"],
      },
    },
  },
});

const REGULAR_LINE_DASHCARD = createMockDashboardCard({
  id: 14,
  dashboard_id: DASHBOARD_ID,
  card_id: PRODUCTS_BY_CREATED_AT.id,
  card: PRODUCTS_BY_CREATED_AT,
  series: [],
  row: 8,
  col: 12,
  size_x: 12,
  size_y: 8,
});

const FUNNEL_DASHCARD = createMockVisualizerDashboardCard({
  id: 15,
  dashboard_id: DASHBOARD_ID,
  card_id: STEP_COLUMN.id,
  card: STEP_COLUMN,
  series: [VIEWS_COLUMN],
  row: 16,
  col: 0,
  size_x: 12,
  size_y: 8,
  visualization_settings: {
    visualization: {
      display: "funnel",
      columnValuesMapping: {
        COLUMN_1: [columnRef("COLUMN_1", "Step", STEP_COLUMN)],
        COLUMN_2: [columnRef("COLUMN_2", "Views", VIEWS_COLUMN)],
      },
      settings: {
        "card.title": "Regular visualizer funnel",
        "funnel.metric": "COLUMN_2",
        "funnel.dimension": "COLUMN_1",
      },
    },
  },
});

const SERIES_B_COLOR = "#F9D45C";
const HOVERED_SERIES_COLOR = "#88BF4D";
// the sum of the Products by Category counts
const PIE_TOTAL = "26";

const VISUALIZER_DASHBOARD_DASHCARDS = [
  MULTI_SERIES_LINE_DASHCARD,
  MULTI_SERIES_BAR_DASHCARD,
  PIE_DASHCARD,
  REGULAR_LINE_DASHCARD,
  FUNNEL_DASHCARD,
];

const ALL_CARDS = [
  ORDERS_BY_CREATED_AT,
  PRODUCTS_BY_CREATED_AT,
  ORDERS_BY_CATEGORY,
  PRODUCTS_BY_CATEGORY,
  STEP_COLUMN,
  VIEWS_COLUMN,
  ORDERS_TABLE,
];

const DEFAULT_SERIES_COLOR = "#509EE3";

const PIVOT_YEARS = ["2022", "2023", "2024", "2025", "2026"];
const PIVOT_CATEGORIES = ["Doohickey", "Gadget", "Gizmo", "Widget"];
const COUNTRY_STEPS = ["(empty)", "AE", "AF", "AG"];

const breakoutColumn = (column: DatasetColumn): DatasetColumn => ({
  ...column,
  source: "breakout",
});

const PIVOT_TABLE = createMockCard({
  id: 55,
  name: "Pivot table",
  display: "pivot",
  dataset_query: STRUCTURED_QUERY,
  visualization_settings: {},
});
const ORDERS_BY_CREATED_AT_AND_CATEGORY = createMockCard({
  id: 50,
  name: "Orders by Created At (Month) & Category",
  display: "line",
  dataset_query: STRUCTURED_QUERY,
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT", "CATEGORY"],
    "graph.metrics": ["count"],
  },
});
const ORDERS_BY_CREATED_AT_AND_CATEGORY_WITH_HIDDEN_SERIES = createMockCard({
  ...ORDERS_BY_CREATED_AT_AND_CATEGORY,
  id: 53,
  name: "Orders by Created At (Month) & Category with hidden series",
  visualization_settings: {
    ...ORDERS_BY_CREATED_AT_AND_CATEGORY.visualization_settings,
    "graph.series_order": [
      { key: "Gadget", name: "Gadget", color: "#F9D45C", enabled: false },
      { key: "Doohickey", name: "Doohickey", color: "#88BF4D", enabled: true },
      { key: "Gizmo", name: "Gizmo", color: "#A989C5", enabled: true },
      { key: "Widget", name: "Widget", color: "#F2A86F", enabled: false },
    ],
    "graph.series_order_dimension": "CATEGORY",
  },
});
const ACCOUNTS_BY_COUNTRY = createMockCard({
  id: 54,
  name: "Accounts by Country",
  display: "bar",
  dataset_query: STRUCTURED_QUERY,
  visualization_settings: {
    "graph.dimensions": ["COUNTRY"],
    "graph.metrics": ["count"],
  },
});

const ratioCard = (id: number, name: string, metric: string) =>
  createMockCard({
    id,
    name,
    display: "line",
    dataset_query: STRUCTURED_QUERY,
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": [metric],
      column_settings: {
        [`["name","${metric}"]`]: { number_style: "percent" },
      },
    },
  });
const TAX_OVER_SUBTOTAL = ratioCard(56, "Question A for 61521", "Tax over Sub");
const TAX_OVER_TOTAL = ratioCard(57, "Question B for 61521", "Tax over Total");

const ratioDataset = (metric: string, ratios: number[]) =>
  createMockDataset({
    data: createMockDatasetData({
      cols: [
        breakoutColumn(createdAtColumn(ORDERS.CREATED_AT)),
        createMockNumericColumn({
          id: undefined,
          name: metric,
          display_name: metric,
          base_type: "type/Float",
          effective_type: "type/Float",
          source: "aggregation",
        }),
      ],
      rows: ratios.map((ratio, index) => [
        `2024-0${index + 1}-01T00:00:00Z`,
        ratio,
      ]),
    }),
  });

const averageColumn = createMockNumericColumn({
  id: undefined,
  name: "avg",
  display_name: "Average of Quantity",
  base_type: "type/Float",
  effective_type: "type/Float",
  source: "aggregation",
});
// the pivot grouping column that the pivot QP adds after the breakouts
const pivotGroupingColumn = createMockNumericColumn({
  id: undefined,
  name: "pivot-grouping",
  display_name: "pivot-grouping",
});
const yearColumn = breakoutColumn(
  createMockDatetimeColumn({
    id: 101,
    name: "CREATED_AT",
    display_name: "Created At: Year",
    unit: "year",
  }),
);
const pivotYear = (year: string) => `${year}-01-01T00:00:00Z`;
// A pivot card without pivot settings returns all its breakout combinations:
// both breakouts (grouping 0), the category (1), the year (2) and the total (3)
const pivotDataset = createMockDataset({
  data: createMockDatasetData({
    cols: [
      yearColumn,
      breakoutColumn(ordersCategoryColumn),
      pivotGroupingColumn,
      countColumn,
      averageColumn,
    ],
    rows: [
      ...PIVOT_YEARS.flatMap((year, yearIndex) =>
        PIVOT_CATEGORIES.map((category, categoryIndex) => [
          pivotYear(year),
          category,
          0,
          100 * (yearIndex + 1) + categoryIndex,
          3 + categoryIndex / 10,
        ]),
      ),
      ...PIVOT_CATEGORIES.map((category, categoryIndex) => [
        null,
        category,
        1,
        1000 + categoryIndex,
        3.5,
      ]),
      ...PIVOT_YEARS.map((year, yearIndex) => [
        pivotYear(year),
        null,
        2,
        400 * (yearIndex + 1),
        3.2,
      ]),
      [null, null, 3, 6000, 3.3],
    ],
  }),
});

const CARTESIAN_CARDS = [
  ...ALL_CARDS,
  PIVOT_TABLE,
  ORDERS_BY_CREATED_AT_AND_CATEGORY,
  ORDERS_BY_CREATED_AT_AND_CATEGORY_WITH_HIDDEN_SERIES,
  ACCOUNTS_BY_COUNTRY,
  TAX_OVER_SUBTOTAL,
  TAX_OVER_TOTAL,
];

const ordersByCreatedAtAndCategoryDataset = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createdAtColumn(ORDERS.CREATED_AT),
      ordersCategoryColumn,
      countColumn,
    ],
    rows: ["2024-01-01T00:00:00Z", "2024-02-01T00:00:00Z"].flatMap(
      (month, monthIndex) =>
        PIVOT_CATEGORIES.map((category, categoryIndex) => [
          month,
          category,
          10 * (monthIndex + 1) + categoryIndex,
        ]),
    ),
  }),
});

const CARTESIAN_DATASETS: Record<CardId, Dataset> = {
  ...DATASETS,
  [ORDERS_BY_CREATED_AT.id]: timeseriesDataset([400, 500, 600]),
  [PRODUCTS_BY_CREATED_AT.id]: timeseriesDataset(
    [8, 9, 10],
    PRODUCTS.CREATED_AT,
  ),
  [ORDERS_BY_CATEGORY.id]: categoryDataset(
    [4000, 5100, 4800, 5000],
    ordersCategoryColumn,
  ),
  [PRODUCTS_BY_CATEGORY.id]: createMockDataset({
    data: createMockDatasetData({
      cols: [productsCategoryColumn, countColumn],
      rows: [
        ["Doohickey", 42],
        ["Gadget", 53],
        ["Gizmo", 51],
        ["Widget", 54],
      ],
    }),
  }),
  [PIVOT_TABLE.id]: pivotDataset,
  [ORDERS_BY_CREATED_AT_AND_CATEGORY.id]: ordersByCreatedAtAndCategoryDataset,
  [ORDERS_BY_CREATED_AT_AND_CATEGORY_WITH_HIDDEN_SERIES.id]:
    ordersByCreatedAtAndCategoryDataset,
  [ACCOUNTS_BY_COUNTRY.id]: createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockCategoryColumn({
          id: 104,
          name: "COUNTRY",
          display_name: "Country",
          semantic_type: "type/Country",
        }),
        countColumn,
      ],
      rows: [
        [null, 5],
        ["AE", 8],
        ["AF", 3],
        ["AG", 6],
      ],
    }),
  }),
  [TAX_OVER_SUBTOTAL.id]: ratioDataset(
    "Tax over Sub",
    [0.061, 0.062, 0.06, 0.063, 0.061, 0.062],
  ),
  [TAX_OVER_TOTAL.id]: ratioDataset(
    "Tax over Total",
    [0.051, 0.052, 0.05, 0.053, 0.051, 0.052],
  ),
};

interface SetupOpts {
  dashcards: DashboardCard[];
  cards?: Card[];
  datasets?: Record<CardId, Dataset>;
}

type SavedDashcard = {
  id: number;
  card_id?: unknown;
  series?: unknown;
  visualization_settings?: unknown;
  row?: unknown;
  col?: unknown;
  size_x?: unknown;
  size_y?: unknown;
};

const LAYOUT_KEYS = ["row", "col", "size_x", "size_y"] as const;

function getSavedLayout(
  dashcard: SavedDashcard,
): Partial<Record<(typeof LAYOUT_KEYS)[number], number>> {
  return Object.fromEntries(
    LAYOUT_KEYS.flatMap((key) => {
      const value = dashcard[key];
      return typeof value === "number" ? [[key, value]] : [];
    }),
  );
}

const FIRST_NEW_DASHCARD_ID = 100;

function isSavedDashcard(value: unknown): value is SavedDashcard {
  return isObject(value) && typeof value.id === "number";
}

function parseSavedDashcards(body: unknown): SavedDashcard[] {
  if (!isObject(body) || !Array.isArray(body.dashcards)) {
    throw new Error("The dashboard save request has no dashcards");
  }
  return body.dashcards.filter(isSavedDashcard);
}

function getSeriesCardIds(series: unknown): number[] {
  return Array.isArray(series)
    ? series.flatMap((card: unknown) =>
        isObject(card) && typeof card.id === "number" ? [card.id] : [],
      )
    : [];
}

/**
 * Stands in for the dashboard API: a save stores the dashcards, gives new
 * dashcards an id and returns full cards, and a later load returns the save.
 */
function setupDashboardApi(
  initialDashboard: Dashboard,
  cards: Card[],
  datasets: Record<CardId, Dataset>,
) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  let savedDashboard = initialDashboard;
  let nextDashcardId = FIRST_NEW_DASHCARD_ID;

  fetchMock.post(
    "express:/api/dashboard/:dashboardId/dashcard/:dashcardId/card/:cardId/query",
    ({ expressParams }) => {
      const dashcard = savedDashboard.dashcards.find(
        ({ id }) => id === Number(expressParams?.dashcardId),
      );
      const cardId = Number(expressParams?.cardId);
      const belongsToDashcard =
        dashcard?.card_id === cardId ||
        (dashcard &&
          "series" in dashcard &&
          dashcard.series?.some(({ id }) => id === cardId));
      if (
        Number(expressParams?.dashboardId) !== savedDashboard.id ||
        !belongsToDashcard
      ) {
        return { status: 404, body: "Not found" };
      }
      return datasets[cardId] ?? { status: 404, body: "Not found" };
    },
    { name: "dashcard-query" },
  );
  fetchMock.get(`path:/api/dashboard/${DASHBOARD_ID}`, () => savedDashboard);
  fetchMock.put(
    `path:/api/dashboard/${DASHBOARD_ID}`,
    ({ options }) => {
      const body: unknown = JSON.parse(String(options.body));
      savedDashboard = {
        ...savedDashboard,
        dashcards: parseSavedDashcards(body).map((dashcard) => {
          const card = checkNotNull(cardsById.get(Number(dashcard.card_id)));
          return createMockDashboardCard({
            ...getSavedLayout(dashcard),
            id: dashcard.id < 0 ? nextDashcardId++ : dashcard.id,
            dashboard_id: DASHBOARD_ID,
            card_id: card.id,
            card,
            series: getSeriesCardIds(dashcard.series).map((id) =>
              checkNotNull(cardsById.get(id)),
            ),
            visualization_settings: isObject(dashcard.visualization_settings)
              ? { ...dashcard.visualization_settings }
              : {},
          });
        }),
      };
      return savedDashboard;
    },
    { name: "save-dashboard" },
  );
}

function setupEndpoints({
  dashcards,
  cards = ALL_CARDS,
  datasets = DATASETS,
}: SetupOpts) {
  const dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    name: "Test Dashboard",
    dashcards,
    collection_id: null,
  });

  setupDashboardApi(dashboard, cards, datasets);
  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([DATABASE]);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({
      databases: [DATABASE],
      // the backend adds native cards, whose columns their drills need
      cards: cards
        .filter((card) => isNativeCard(card))
        .map((card) => ({
          ...card,
          result_metadata:
            // The API returns dataset columns as the card metadata, which `Field` does not type.
            (datasets[card.id]?.data.cols as unknown as Field[] | undefined) ??
            null,
        })),
    }),
  );
  setupCollectionsEndpoints({
    collections: [
      createMockCollection({ ...ROOT_COLLECTION, can_write: true }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: createMockCollection(ROOT_COLLECTION),
    collectionItems: cards.map((card) =>
      createMockCollectionItem({
        id: card.id,
        name: card.name,
        model: "card",
        display: card.display,
      }),
    ),
  });
  setupBookmarksEndpoints([]);
  setupRecentViewsEndpoints([]);
  setupTimelinesEndpoints([]);
  setupLastDownloadFormatEndpoints();
  setupSearchEndpoints(
    cards.map((card) =>
      createMockSearchResult({
        id: card.id,
        name: card.name,
        model: "card",
        display: isCardDisplayType(card.display) ? card.display : null,
        result_metadata: datasets[card.id]?.data.cols.map(toResultMetadata),
      }),
    ),
  );

  cards.forEach((card) => {
    setupCardEndpoints(card);
    setupCardQueryMetadataEndpoint(
      card,
      createMockCardQueryMetadata({ databases: [DATABASE] }),
    );
  });

  const datasetFor = (cardId: string | undefined) =>
    datasets[Number(cardId)] ?? { status: 404, body: "Not found" };

  fetchMock.post(
    "express:/api/card/:cardId/query",
    ({ expressParams }) => datasetFor(expressParams?.cardId),
    { name: "card-query" },
  );
}

async function renderDashboard() {
  const view = renderWithProviders(
    <>
      <Route path="/dashboard/:slug" element={<DashboardApp />} />
      <Route path="/question/:slug" element={<div>Question page</div>} />
    </>,
    {
      initialRoute: `/dashboard/${DASHBOARD_ID}`,
      withRouter: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [DATABASE] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );
  // dashcards keep their own loading indicators until their queries return
  await waitFor(() => {
    expect(
      screen.queryByTestId("dashboard-grid-skeleton"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("dashboard-header-skeleton"),
    ).not.toBeInTheDocument();
  });
  await screen.findByTestId("dashboard-header");
  return { ...view, router: checkNotNull(view.router) };
}

async function setup(opts: SetupOpts) {
  setupEndpoints(opts);
  return renderDashboard();
}

function queryDashcard(dashcardId: number) {
  return screen
    .queryAllByTestId("dashcard")
    .find(
      (dashcard) =>
        dashcard.getAttribute("data-dashcard-key") === String(dashcardId),
    );
}

function getDashcard(dashcardId: number) {
  return checkNotNull(queryDashcard(dashcardId));
}

/** Finds a dashcard once its query results are shown */
async function findDashcard(dashcardId: number) {
  await waitFor(() => {
    const dashcard = getDashcard(dashcardId);
    expect(
      within(dashcard).queryByTestId("loading-indicator"),
    ).not.toBeInTheDocument();
  });
  return getDashcard(dashcardId);
}

async function editDashboard() {
  await userEvent.click(screen.getByLabelText("Edit dashboard"));
  await screen.findByText("You're editing this dashboard.");
}

async function saveDashboard() {
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(
      screen.queryByText("You're editing this dashboard."),
    ).not.toBeInTheDocument(),
  );
}

async function openVisualizer(
  dashcardId: number,
  label: "Edit visualization" | "Visualize another way",
) {
  const dashcard = await findDashcard(dashcardId);
  await userEvent.click(await within(dashcard).findByLabelText(label));
  return findVisualizerModal();
}

async function findVisualizerModal() {
  await screen.findByTestId("visualizer-header");
  const modal = getVisualizerModal();
  await waitFor(() =>
    expect(
      within(modal).queryByTestId("visualization-canvas-loader"),
    ).not.toBeInTheDocument(),
  );
  return modal;
}

function getVisualizerModal() {
  return checkNotNull(
    screen
      .getAllByRole("dialog")
      .find(
        (dialog) => within(dialog).queryByTestId("visualizer-header") != null,
      ),
  );
}

async function saveVisualizer(label: "Save" | "Add to dashboard" = "Save") {
  await userEvent.click(
    within(getVisualizerModal()).getByRole("button", { name: label }),
  );
  await waitFor(() =>
    expect(screen.queryByTestId("visualizer-header")).not.toBeInTheDocument(),
  );
}

function getWellItems(wellTestId: string) {
  return within(screen.getByTestId(wellTestId))
    .queryAllByTestId("well-item")
    .map((item) => item.textContent);
}

async function addDataset(name: string) {
  const modal = getVisualizerModal();
  const addMoreDataButton = within(modal).queryByRole("button", {
    name: "Add more data",
  });
  if (addMoreDataButton) {
    await userEvent.click(addMoreDataButton);
  }
  const search = within(modal).getByPlaceholderText("Search for something");
  // the picker stays mounted while hidden, so check that users can see it
  expect(search).toBeVisible();
  await userEvent.clear(search);
  await userEvent.type(search, name);
  const datasetsList = within(modal).getByTestId("datasets-list");
  await within(datasetsList).findByText(name);
  const item = getItemWithText(
    within(datasetsList).getAllByTestId("swap-dataset-button"),
    name,
  );
  expect(item).toBeVisible();
  expect(item).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(item);
  await waitFor(() => expect(item).toHaveAttribute("aria-pressed", "true"));
  // the data source is added once its query results are in
  await waitFor(() =>
    expect(
      within(getDataSourceItem(name)).getAllByTestId("column-list-item").length,
    ).toBeGreaterThan(0),
  );
}

function getItemWithText(items: HTMLElement[], text: string) {
  return checkNotNull(
    items.find((item) => within(item).queryByText(text) != null),
  );
}

function getColumnListItem(dataSourceItem: HTMLElement, columnName: string) {
  return getItemWithText(
    within(dataSourceItem).getAllByTestId("column-list-item"),
    columnName,
  );
}

function getColumnSelection(dataSourceName: string, columnName: string) {
  return getColumnListItem(
    getDataSourceItem(dataSourceName),
    columnName,
  ).getAttribute("aria-selected");
}

function getDataSourceItem(name: string) {
  return checkNotNull(
    within(screen.getByTestId("visualizer-data-importer"))
      .queryAllByTestId("data-source-list-item")
      .find((item) => within(item).queryByText(name) != null),
  );
}

/** The names of the data sources in the visualizer, in their order */
function getDataSourceNames(candidateNames: string[]) {
  return within(screen.getByTestId("visualizer-data-importer"))
    .queryAllByTestId("data-source-list-item")
    .map((item) =>
      candidateNames.find((name) => within(item).queryByText(name) != null),
    );
}

function getSavedDashcards(): SavedDashcard[] {
  const call = fetchMock.callHistory.lastCall("save-dashboard");
  return parseSavedDashcards(JSON.parse(String(call?.options.body)));
}

/** The visualizer definition of a dashcard in the last dashboard save */
function getSavedVisualization(dashcardId: number): unknown {
  const dashcard = getSavedDashcards().find(({ id }) => id === dashcardId);
  const settings = dashcard?.visualization_settings;
  return isObject(settings) ? settings.visualization : undefined;
}

/** Hovering the title turns it into a link, so hover before clicking it. */
async function clickDashcardTitle(dashcardId: number) {
  await findDashcard(dashcardId);
  const getTitle = () =>
    within(getDashcard(dashcardId)).getByTestId("legend-caption-title");
  await userEvent.hover(getTitle());
  await userEvent.click(getTitle());
}

/** Finds a dashcard by its title once its query results are shown */
async function findDashcardByTitle(title: string) {
  const isLoadedWithTitle = (dashcard: HTMLElement) =>
    within(dashcard).queryByText(title, {
      selector: "[data-testid='legend-caption-title']",
    }) != null && within(dashcard).queryByTestId("loading-indicator") == null;
  await waitFor(() =>
    expect(screen.queryAllByTestId("dashcard").some(isLoadedWithTitle)).toBe(
      true,
    ),
  );
  return checkNotNull(
    screen.getAllByTestId("dashcard").find(isLoadedWithTitle),
  );
}

async function openVisualizerFromQuestionsSidebar(cardName: string) {
  await userEvent.click(screen.getByLabelText("Add questions"));
  const sidebar = await screen.findByTestId("add-card-sidebar");
  await within(sidebar).findByRole("menuitem", { name: cardName });
  // each question in the list is followed by its own "Visualize another way" button
  const questionNames = within(sidebar)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
  const visualizeButtons = within(sidebar).getAllByLabelText(
    "Visualize another way",
  );
  await userEvent.click(
    checkNotNull(visualizeButtons.at(questionNames.indexOf(cardName))),
  );
  return findVisualizerModal();
}

function getGoalLine(container: HTMLElement) {
  return container.querySelector(
    `path[stroke-dasharray='${GOAL_LINE_DASH.join(",")}']`,
  );
}

function getLegendItemNames(container: HTMLElement) {
  return within(within(container).getByLabelText("Legend"))
    .getAllByTestId("legend-item")
    .map((item) => item.textContent);
}

/** Finds a dashcard once its legend is shown */
async function findDashcardWithLegend(dashcardId: number) {
  const dashcard = await findDashcard(dashcardId);
  await within(dashcard).findByLabelText("Legend");
  return dashcard;
}

function expectColumnSelected(
  dataSourceName: string,
  columnName: string,
  isSelected = true,
) {
  expect(
    getColumnListItem(getDataSourceItem(dataSourceName), columnName),
  ).toHaveAttribute("aria-selected", String(isSelected));
}

function expectCurrentDisplay(modal: HTMLElement, display: string) {
  expect(
    within(within(modal).getByTestId("viz-picker-main")).getByDisplayValue(
      display,
    ),
  ).toBeChecked();
}

/** The y-axis labels of a cartesian chart, on both sides */
function getYAxisLabels(chart: HTMLElement) {
  return Array.from(
    chart.querySelectorAll(
      "text[text-anchor='end'], text[text-anchor='start']",
    ),
  ).map((text) => text.textContent?.trim() ?? "");
}

/**
 * Shows the ECharts tooltip of a data point of the series drawn in a color.
 * jsdom has no layout for a real hover, so this dispatches the action that a
 * hover triggers, and the chart renders the tooltip with its own formatter.
 */
async function showChartTooltip(
  chart: HTMLElement,
  { seriesColor, dataIndex }: { seriesColor: string; dataIndex: number },
) {
  const instance = checkNotNull(getInstanceByDom(chart));
  const { series } = instance.getOption();
  const seriesIndex = Array.isArray(series)
    ? series.findIndex(
        (option) =>
          isObject(option.lineStyle) && option.lineStyle.color === seriesColor,
      )
    : -1;
  expect(seriesIndex).toBeGreaterThanOrEqual(0);
  act(() => {
    instance.dispatchAction({ type: "showTip", seriesIndex, dataIndex });
  });
  return screen.findByTestId("echarts-tooltip");
}

function getTrendLines(container: HTMLElement) {
  return container.querySelectorAll(
    `path[stroke-dasharray='${TREND_LINE_DASH.join(",")}']`,
  );
}

function getPathsWithFill(container: HTMLElement, color: string) {
  return container.querySelectorAll(`path[fill='${color}']`);
}

function getPathsWithStroke(container: HTMLElement, color: string) {
  return container.querySelectorAll(`path[stroke='${color}']`);
}

function getPieSlices(container: HTMLElement) {
  return container.querySelectorAll("path[stroke-linejoin='bevel']");
}

async function hoverInfoIcon(dashcardId: number) {
  const dashcard = await findDashcard(dashcardId);
  await userEvent.hover(within(dashcard).getByLabelText("info icon"));
  return screen.findByRole("tooltip");
}

/** zrender element types: "path" for line chart points, "rect" for bars */
type ChartElementType = "path" | "rect" | "sector";

type ChartElementTarget = {
  type: ChartElementType;
  color: string;
  index: number;
};

function getChart(dashcard: HTMLElement) {
  const chartRoot = within(dashcard).getByTestId("chart-container");
  return checkNotNull(getInstanceByDom(chartRoot));
}

/**
 * The coordinates of a point that hits a chart element, which zrender finds by
 * geometry rather than by DOM target. Elements of the given type and color are
 * ordered from left to right.
 */
function getChartElementPoint(
  dashcard: HTMLElement,
  { type, color, index }: ChartElementTarget,
) {
  const zr = getChart(dashcard).getZr();
  const elements = zr.storage
    .getDisplayList()
    .filter(
      (element) =>
        element.type === type &&
        (element.style.fill === color || element.style.stroke === color),
    )
    .map((element) => {
      const rect = element.getBoundingRect().clone();
      rect.applyTransform(element.getComputedTransform());
      return { element, rect };
    })
    .sort((a, b) => a.rect.x - b.rect.x);
  const { element, rect } = checkNotNull(elements.at(index));
  const STEPS = 20;
  for (let i = 1; i < STEPS; i++) {
    for (let j = 1; j < STEPS; j++) {
      const x = rect.x + (rect.width * i) / STEPS;
      const y = rect.y + (rect.height * j) / STEPS;
      if (zr.handler.findHover(x, y).target === element) {
        return { x, y };
      }
    }
  }
  throw new Error(`No point hits the ${type} element at ${index}`);
}

function getChartSurface(dashcard: HTMLElement) {
  const chartRoot = getChart(dashcard).getDom();
  return checkNotNull(chartRoot.querySelector("svg"));
}

function clickChartElement(dashcard: HTMLElement, target: ChartElementTarget) {
  const { x, y } = getChartElementPoint(dashcard, target);
  const surface = getChartSurface(dashcard);
  const coords = { clientX: x, clientY: y };
  fireEvent.mouseMove(surface, coords);
  fireEvent.mouseDown(surface, coords);
  fireEvent.mouseUp(surface, coords);
  fireEvent.click(surface, coords);
}

/** Drags across the chart from one element to another */
function brushChart(
  dashcard: HTMLElement,
  from: ChartElementTarget,
  to: ChartElementTarget,
) {
  const start = getChartElementPoint(dashcard, from);
  const end = getChartElementPoint(dashcard, to);
  const surface = getChartSurface(dashcard);
  fireEvent.mouseDown(surface, { clientX: start.x, clientY: start.y });
  fireEvent.mouseMove(surface, { clientX: end.x, clientY: end.y });
  fireEvent.mouseUp(surface, { clientX: end.x, clientY: end.y });
}

/** The ad-hoc question that a drill opens, as the query builder would show it */
async function findDrilledQuestion(router: TestRouter) {
  await waitFor(() => expect(router.location.pathname).toBe("/question"));
  const card = deserializeCardFromUrl(router.location.hash);
  const query = new Question(card, METADATA).query();
  const getNames = (clauses: Lib.Clause[]) =>
    clauses.map((clause) => Lib.displayInfo(query, -1, clause).longDisplayName);
  return {
    originalCardId: card.original_card_id,
    display: card.display,
    sourceTableId: Lib.sourceTableOrCardId(query),
    filters: getNames(Lib.filters(query, -1)),
    aggregations: getNames(Lib.aggregations(query, -1)),
    breakouts: getNames(Lib.breakouts(query, -1)),
  };
}

async function findClickActions() {
  return screen.findByTestId("click-actions-view");
}

describe("DashboardApp > visualizer", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    resetMockExplicitSize();
  });

  describe("editing a dashcard", () => {
    it("should turn a question dashcard into a visualizer dashcard with another data source", async () => {
      await setup({ dashcards: [REGULAR_LINE_DASHCARD] });
      await editDashboard();

      const modal = await openVisualizer(
        REGULAR_LINE_DASHCARD.id,
        "Visualize another way",
      );
      expect(within(modal).getByTestId("visualizer-title")).toHaveValue(
        PRODUCTS_BY_CREATED_AT.name,
      );

      await addDataset(ORDERS_BY_CREATED_AT.name);

      expect(getWellItems("vertical-well")).toEqual([
        "Count",
        `Count (${ORDERS_BY_CREATED_AT.name})`,
      ]);
      expect(getWellItems("horizontal-well")).toEqual(["Created At: Month"]);
      expect(
        within(within(modal).getByLabelText("Legend")).getAllByTestId(
          "legend-item",
        ),
      ).toHaveLength(2);

      await saveVisualizer();

      const dashcard = getDashcard(REGULAR_LINE_DASHCARD.id);
      const legend = await within(dashcard).findByLabelText("Legend");
      expect(
        within(legend).getByText(PRODUCTS_BY_CREATED_AT.name),
      ).toBeInTheDocument();
      expect(
        within(legend).getByText(ORDERS_BY_CREATED_AT.name),
      ).toBeInTheDocument();

      await saveDashboard();

      const [savedDashcard] = getSavedDashcards();
      expect(savedDashcard).toMatchObject({
        id: REGULAR_LINE_DASHCARD.id,
        card_id: PRODUCTS_BY_CREATED_AT.id,
        series: [expect.objectContaining({ id: ORDERS_BY_CREATED_AT.id })],
      });
      expect(getSavedVisualization(REGULAR_LINE_DASHCARD.id)).toEqual({
        display: "bar",
        columnValuesMapping: {
          COLUMN_1: [
            columnRef("COLUMN_1", "CREATED_AT", PRODUCTS_BY_CREATED_AT),
          ],
          COLUMN_2: [columnRef("COLUMN_2", "count", PRODUCTS_BY_CREATED_AT)],
          COLUMN_3: [columnRef("COLUMN_3", "count", ORDERS_BY_CREATED_AT)],
          COLUMN_4: [columnRef("COLUMN_4", "CREATED_AT", ORDERS_BY_CREATED_AT)],
        },
        settings: {
          "graph.dimensions": ["COLUMN_1", "COLUMN_4"],
          "graph.metrics": ["COLUMN_2", "COLUMN_3"],
        },
      });

      const savedLegend = await within(
        await findDashcard(REGULAR_LINE_DASHCARD.id),
      ).findByLabelText("Legend");
      expect(
        within(savedLegend).getByText(PRODUCTS_BY_CREATED_AT.name),
      ).toBeInTheDocument();
      expect(
        within(savedLegend).getByText(ORDERS_BY_CREATED_AT.name),
      ).toBeInTheDocument();
    });

    it("should save a dashcard with a display the visualizer doesn't support as it is first shown", async () => {
      const tableDashcard = createMockDashboardCard({
        id: 21,
        dashboard_id: DASHBOARD_ID,
        card_id: ORDERS_TABLE.id,
        card: ORDERS_TABLE,
        size_x: 12,
        size_y: 8,
      });
      await setup({ dashcards: [tableDashcard] });
      await editDashboard();

      const dashcard = await findDashcard(tableDashcard.id);
      expect(
        within(dashcard).getByLabelText("Show visualization options"),
      ).toBeInTheDocument();

      const modal = await openVisualizer(
        tableDashcard.id,
        "Visualize another way",
      );
      const ordersSource = within(modal).getByTestId("data-source-list-item");
      const columnItem = (name: string) =>
        getColumnListItem(ordersSource, name);
      expect(columnItem("ID")).toHaveAttribute("aria-selected", "true");
      expect(columnItem("Subtotal")).toHaveAttribute("aria-selected", "true");
      expect(columnItem("Total")).toHaveAttribute("aria-selected", "false");
      expect(getWellItems("vertical-well")).toEqual(["Subtotal"]);
      expect(getWellItems("horizontal-well")).toEqual(["ID"]);
      expect(
        within(within(modal).getByTestId("viz-picker-main")).getByDisplayValue(
          "bar",
        ),
      ).toBeChecked();
      // an unchanged card can be saved, as its display came from the visualizer
      expect(within(modal).getByRole("button", { name: "Save" })).toBeEnabled();

      await saveVisualizer();

      expect(
        await within(dashcard).findByLabelText("Edit visualization"),
      ).toBeInTheDocument();
      expect(
        within(dashcard).queryByLabelText("Visualize another way"),
      ).not.toBeInTheDocument();
      expect(
        within(dashcard).queryByLabelText("Show visualization options"),
      ).not.toBeInTheDocument();

      const reopenedModal = await openVisualizer(
        tableDashcard.id,
        "Edit visualization",
      );
      expect(getWellItems("vertical-well")).toEqual(["Subtotal"]);
      expect(getWellItems("horizontal-well")).toEqual(["ID"]);
      expect(
        within(reopenedModal).getByRole("button", { name: "Save" }),
      ).toBeDisabled();
    });

    it("should start pristine and enable saving only after a change (metabase#69038)", async () => {
      await setup({ dashcards: [MULTI_SERIES_LINE_DASHCARD] });
      await editDashboard();

      const modal = await openVisualizer(
        MULTI_SERIES_LINE_DASHCARD.id,
        "Edit visualization",
      );
      // the data has loaded, so the card could be saved if it were changed
      await waitFor(() =>
        expect(getWellItems("vertical-well")).toHaveLength(2),
      );
      expect(
        within(modal).getByRole("button", { name: "Save" }),
      ).toBeDisabled();

      // the preview table only renders the cells that fit in its measured size
      mockGetBoundingClientRect({ width: 800, height: 600 });
      await userEvent.click(
        within(modal).getByTestId("visualizer-view-as-table-button"),
      );
      const preview = await screen.findByTestId(
        "visualizer-tabular-preview-modal",
      );
      expect(
        await within(preview).findByRole("columnheader", { name: /^Count$/ }),
      ).toBeInTheDocument();
      await userEvent.click(within(preview).getByLabelText("Close"));
      await waitFor(() =>
        expect(
          screen.queryByTestId("visualizer-tabular-preview-modal"),
        ).not.toBeInTheDocument(),
      );

      expect(
        within(modal).getByRole("button", { name: "Save" }),
      ).toBeDisabled();

      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(
          screen.queryByTestId("visualizer-header"),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByText("Are you sure you want to leave?"),
      ).not.toBeInTheDocument();

      const reopenedModal = await openVisualizer(
        MULTI_SERIES_LINE_DASHCARD.id,
        "Edit visualization",
      );
      await userEvent.click(within(reopenedModal).getByTestId("bar"));
      expect(
        within(reopenedModal).getByRole("button", { name: "Save" }),
      ).toBeEnabled();

      // a changed card asks before it closes
      await userEvent.keyboard("{Escape}");
      expect(
        await screen.findByText("Are you sure you want to leave?"),
      ).toBeInTheDocument();
    });

    it("should reset a data source to the card defaults", async () => {
      const lineDashcard = createMockVisualizerDashboardCard({
        id: 22,
        dashboard_id: DASHBOARD_ID,
        card_id: ORDERS_BY_CREATED_AT.id,
        card: ORDERS_BY_CREATED_AT,
        series: [],
        size_x: 12,
        size_y: 8,
        visualization_settings: {
          visualization: {
            display: "line",
            columnValuesMapping: {
              COLUMN_1: [
                columnRef("COLUMN_1", "CREATED_AT", ORDERS_BY_CREATED_AT),
              ],
              COLUMN_2: [columnRef("COLUMN_2", "count", ORDERS_BY_CREATED_AT)],
            },
            settings: {
              "graph.dimensions": ["COLUMN_1"],
              "graph.metrics": ["COLUMN_2"],
            },
          },
        },
      });
      await setup({ dashcards: [lineDashcard] });
      await editDashboard();

      let modal = await openVisualizer(lineDashcard.id, "Edit visualization");
      await userEvent.click(within(modal).getByTestId("pie"));
      expect(getWellItems("pie-metric-well")).toEqual(["Count"]);
      expect(getWellItems("pie-dimension-well")).toEqual(["Created At: Month"]);
      await saveVisualizer();
      await saveDashboard();
      expect(getSavedVisualization(lineDashcard.id)).toMatchObject({
        display: "pie",
      });

      await editDashboard();
      modal = await openVisualizer(lineDashcard.id, "Edit visualization");
      expect(getWellItems("pie-metric-well")).toEqual(["Count"]);

      const openResetItem = async () => {
        await userEvent.click(
          within(modal).getByLabelText("Datasource actions"),
        );
        return within(
          await screen.findByTestId("datasource-actions-dropdown"),
        ).getByLabelText("Reset data source");
      };

      const resetItem = await openResetItem();
      expect(resetItem).toBeEnabled();
      await userEvent.click(resetItem);

      await waitFor(() =>
        expect(
          within(
            within(modal).getByTestId("viz-picker-main"),
          ).getByDisplayValue("line"),
        ).toBeChecked(),
      );
      expect(getWellItems("vertical-well")).toEqual(["Count"]);
      expect(getWellItems("horizontal-well")).toEqual(["Created At: Month"]);
      expect(await openResetItem()).toBeDisabled();
    });
  });

  describe("titles and descriptions", () => {
    it("should rename, describe and untitle dashcards (metabase#61457)", async () => {
      const { unmount } = await setup({
        dashcards: VISUALIZER_DASHBOARD_DASHCARDS,
      });
      await editDashboard();

      // My chart -> Renamed chart, with a description
      let modal = await openVisualizer(
        MULTI_SERIES_LINE_DASHCARD.id,
        "Edit visualization",
      );
      const title = within(modal).getByTestId("visualizer-title");
      expect(title).toHaveValue("My chart");
      await userEvent.clear(title);
      await userEvent.type(title, "Renamed chart");
      await userEvent.tab();
      await userEvent.click(
        within(modal).getByRole("button", { name: "Settings" }),
      );
      const description = within(modal).getByTestId("card.description");
      expect(description).toHaveValue("");
      await userEvent.type(description, "My description");
      await userEvent.tab();
      await saveVisualizer();
      expect(
        within(getDashcard(MULTI_SERIES_LINE_DASHCARD.id)).getByTestId(
          "legend-caption-title",
        ),
      ).toHaveTextContent("Renamed chart");

      // a question dashcard: card name -> Another chart
      modal = await openVisualizer(
        REGULAR_LINE_DASHCARD.id,
        "Visualize another way",
      );
      const regularTitle = within(modal).getByTestId("visualizer-title");
      expect(regularTitle).toHaveValue(PRODUCTS_BY_CREATED_AT.name);
      await userEvent.clear(regularTitle);
      await userEvent.type(regularTitle, "Another chart");
      await userEvent.tab();
      await saveVisualizer();
      await waitFor(() =>
        expect(
          within(getDashcard(REGULAR_LINE_DASHCARD.id)).getByTestId(
            "legend-caption-title",
          ),
        ).toHaveTextContent("Another chart"),
      );

      // My category chart and My pie chart -> no title
      for (const dashcardId of [
        MULTI_SERIES_BAR_DASHCARD.id,
        PIE_DASHCARD.id,
      ]) {
        modal = await openVisualizer(dashcardId, "Edit visualization");
        await userEvent.clear(within(modal).getByTestId("visualizer-title"));
        await userEvent.tab();
        expect(
          within(modal).getByRole("button", { name: "Save" }),
        ).toBeEnabled();
        await saveVisualizer();
        await waitFor(() =>
          expect(
            within(getDashcard(dashcardId)).getByTestId("legend-caption-title"),
          ).toHaveTextContent(/^$/),
        );
      }

      await saveDashboard();

      expect(
        getSavedVisualization(MULTI_SERIES_LINE_DASHCARD.id),
      ).toMatchObject({
        settings: {
          "card.title": "Renamed chart",
          "card.description": "My description",
        },
      });
      expect(getSavedVisualization(REGULAR_LINE_DASHCARD.id)).toMatchObject({
        settings: { "card.title": "Another chart" },
      });
      expect(getSavedVisualization(MULTI_SERIES_BAR_DASHCARD.id)).toMatchObject(
        { settings: { "card.title": "" } },
      );
      expect(getSavedVisualization(PIE_DASHCARD.id)).toMatchObject({
        settings: { "card.title": "" },
      });

      unmount();
      await renderDashboard();

      const expectedTitles = [
        [MULTI_SERIES_LINE_DASHCARD.id, "Renamed chart"],
        [MULTI_SERIES_BAR_DASHCARD.id, ""],
        [PIE_DASHCARD.id, ""],
        [REGULAR_LINE_DASHCARD.id, "Another chart"],
      ] as const;
      for (const [dashcardId, expectedTitle] of expectedTitles) {
        const dashcard = await findDashcard(dashcardId);
        expect(
          await within(dashcard).findByTestId("legend-caption-title"),
        ).toHaveTextContent(new RegExp(`^${expectedTitle}$`));
      }

      const tooltip = await hoverInfoIcon(MULTI_SERIES_LINE_DASHCARD.id);
      expect(tooltip).toHaveTextContent("My description");

      // an untitled card isn't renamed to a default title
      await editDashboard();
      modal = await openVisualizer(
        MULTI_SERIES_BAR_DASHCARD.id,
        "Edit visualization",
      );
      expect(within(modal).getByTestId("visualizer-title")).toHaveValue("");
    });

    it("should offer the underlying questions in the menu of untitled dashcards only (metabase#61457)", async () => {
      const untitled = (
        dashcard: VisualizerDashboardCard,
      ): VisualizerDashboardCard => {
        const { visualization } = dashcard.visualization_settings;
        return {
          ...dashcard,
          visualization_settings: {
            visualization: {
              ...visualization,
              settings: { ...visualization.settings, "card.title": "" },
            },
          },
        };
      };
      const { router } = await setup({
        dashcards: [MULTI_SERIES_LINE_DASHCARD, untitled(PIE_DASHCARD)],
      });

      const titledDashcard = await findDashcard(MULTI_SERIES_LINE_DASHCARD.id);
      await userEvent.click(
        await within(titledDashcard).findByTestId("dashcard-menu"),
      );
      let menu = await screen.findByRole("menu");
      expect(within(menu).getByText("Download results")).toBeInTheDocument();
      expect(
        within(menu).queryByText("View question(s)"),
      ).not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
      );

      const untitledDashcard = await findDashcard(PIE_DASHCARD.id);
      await userEvent.click(
        await within(untitledDashcard).findByTestId("dashcard-menu"),
      );
      menu = await screen.findByRole("menu");
      expect(within(menu).getByText("Download results")).toBeInTheDocument();
      await userEvent.hover(within(menu).getByText("View question(s)"));
      const questions = await screen.findByTestId(
        "dashcard-menu-open-underlying-question",
      );
      await userEvent.click(
        within(questions).getByText(PRODUCTS_BY_CATEGORY.name),
      );

      await waitFor(() =>
        expect(router.location.pathname).toBe(
          `/question/${PRODUCTS_BY_CATEGORY.id}-products-by-category`,
        ),
      );
    });

    it("should propagate the original card title and description (metabase#63863, metabase#64340)", async () => {
      const questionWithDescription = createMockCard({
        ...ORDERS_BY_CREATED_AT,
        id: 30,
        name: "Original Question Title",
        description: "Original question description",
      });
      const questionDashcard = createMockDashboardCard({
        id: 31,
        dashboard_id: DASHBOARD_ID,
        card_id: questionWithDescription.id,
        card: questionWithDescription,
        size_x: 12,
        size_y: 8,
      });
      const { router, unmount } = await setup({
        dashcards: [questionDashcard],
        cards: [...ALL_CARDS, questionWithDescription],
        datasets: {
          ...DATASETS,
          [questionWithDescription.id]: timeseriesDataset([7, 8, 9]),
        },
      });

      const getTitle = () =>
        within(getDashcard(questionDashcard.id)).getByTestId(
          "legend-caption-title",
        );
      expect(
        await within(await findDashcard(questionDashcard.id)).findByText(
          "Original Question Title",
        ),
      ).toBeInTheDocument();
      expect(await hoverInfoIcon(questionDashcard.id)).toHaveTextContent(
        "Original question description",
      );

      await editDashboard();
      let modal = await openVisualizer(
        questionDashcard.id,
        "Visualize another way",
      );
      expect(within(modal).getByTestId("visualizer-title")).toHaveValue(
        "Original Question Title",
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Settings" }),
      );
      expect(within(modal).getByTestId("card.description")).toHaveValue(
        "Original question description",
      );
      await userEvent.click(within(modal).getByTestId("bar"));
      await saveVisualizer();
      await saveDashboard();

      await waitFor(() =>
        expect(getTitle()).toHaveTextContent("Original Question Title"),
      );
      expect(await hoverInfoIcon(questionDashcard.id)).toHaveTextContent(
        "Original question description",
      );

      await clickDashcardTitle(questionDashcard.id);
      await waitFor(() =>
        expect(router.location.pathname).toMatch(
          new RegExp(`^/question/${questionWithDescription.id}-`),
        ),
      );

      unmount();
      await renderDashboard();
      await editDashboard();

      modal = await openVisualizer(questionDashcard.id, "Edit visualization");
      const title = within(modal).getByTestId("visualizer-title");
      expect(title).toHaveValue("Original Question Title");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Settings" }),
      );
      const description = within(modal).getByTestId("card.description");
      expect(description).toHaveValue("Original question description");

      await userEvent.clear(title);
      await userEvent.type(title, "Updated Title");
      await userEvent.tab();
      await userEvent.clear(description);
      await userEvent.type(description, "Updated description");
      await userEvent.tab();
      await saveVisualizer();
      await saveDashboard();

      expect(getSavedVisualization(questionDashcard.id)).toMatchObject({
        settings: {
          "card.title": "Updated Title",
          "card.description": "Updated description",
        },
      });
      await waitFor(() =>
        expect(getTitle()).toHaveTextContent("Updated Title"),
      );
      expect(await hoverInfoIcon(questionDashcard.id)).toHaveTextContent(
        "Updated description",
      );
    });

    it.each([
      {
        name: "the first series of a multi-series chart",
        dashcard: MULTI_SERIES_LINE_DASHCARD,
        menuItem: ORDERS_BY_CREATED_AT.name,
        path: `/question/${ORDERS_BY_CREATED_AT.id}-orders-by-created-at-month`,
      },
      {
        name: "the second series of a multi-series chart",
        dashcard: MULTI_SERIES_LINE_DASHCARD,
        menuItem: PRODUCTS_BY_CREATED_AT.name,
        path: `/question/${PRODUCTS_BY_CREATED_AT.id}-products-by-created-at-month`,
      },
      {
        name: "the first series of a funnel",
        dashcard: FUNNEL_DASHCARD,
        menuItem: STEP_COLUMN.name,
        path: `/question/${STEP_COLUMN.id}-step-column`,
      },
      {
        name: "the second series of a funnel",
        dashcard: FUNNEL_DASHCARD,
        menuItem: VIEWS_COLUMN.name,
        path: `/question/${VIEWS_COLUMN.id}-views-column`,
      },
    ])(
      "should open the question of $name from the dashcard title",
      async ({ dashcard, menuItem, path }) => {
        const { router } = await setup({
          dashcards: VISUALIZER_DASHBOARD_DASHCARDS,
        });

        await within(await findDashcard(dashcard.id)).findByTestId(
          "legend-caption-title",
        );
        await clickDashcardTitle(dashcard.id);
        const menu = await screen.findByTestId("legend-caption-menu");
        await userEvent.click(within(menu).getByText(menuItem));

        await waitFor(() => expect(router.location.pathname).toBe(path));
      },
    );

    it("should open the question of a single-series pie chart from the dashcard title", async () => {
      const { router } = await setup({
        dashcards: VISUALIZER_DASHBOARD_DASHCARDS,
      });

      await within(await findDashcard(PIE_DASHCARD.id)).findByTestId(
        "legend-caption-title",
      );
      await clickDashcardTitle(PIE_DASHCARD.id);

      await waitFor(() =>
        expect(router.location.pathname).toBe(
          `/question/${PRODUCTS_BY_CATEGORY.id}-products-by-category`,
        ),
      );
    });

    it("should open the question of a single-question visualizer funnel from the dashcard title (metabase#67980)", async () => {
      const funnelQuestion = createMockCard({
        id: 60,
        name: "UXW-2692 Funnel Base",
        display: "funnel",
        dataset_query: STEP_COLUMN.dataset_query,
        visualization_settings: {
          "funnel.metric": "Val",
          "funnel.dimension": "Step",
        },
      });
      const singleQuestionFunnel = createMockVisualizerDashboardCard({
        id: 61,
        dashboard_id: DASHBOARD_ID,
        card_id: funnelQuestion.id,
        card: funnelQuestion,
        series: [],
        row: 24,
        col: 0,
        size_x: 12,
        size_y: 8,
        visualization_settings: {
          visualization: {
            display: "funnel",
            columnValuesMapping: {
              COLUMN_1: [columnRef("COLUMN_1", "Step", funnelQuestion)],
              COLUMN_2: [columnRef("COLUMN_2", "Val", funnelQuestion)],
            },
            settings: {
              "card.title": "UXW-2692 Visualizer Funnel",
              "funnel.metric": "COLUMN_2",
              "funnel.dimension": "COLUMN_1",
              "funnel.rows": [
                { key: "Followers", name: "Followers", enabled: true },
                { key: "Downloads", name: "Downloads", enabled: true },
              ],
            },
          },
        },
      });
      const { router } = await setup({
        dashcards: [...VISUALIZER_DASHBOARD_DASHCARDS, singleQuestionFunnel],
        cards: [...ALL_CARDS, funnelQuestion],
        datasets: {
          ...DATASETS,
          [funnelQuestion.id]: createMockDataset({
            data: createMockDatasetData({
              cols: [
                createMockNumericColumn({ name: "Val", display_name: "Val" }),
                createMockCategoryColumn({
                  name: "Step",
                  display_name: "Step",
                }),
              ],
              rows: [
                [73, "Downloads"],
                [52, "Followers"],
              ],
            }),
          }),
        },
      });

      const dashcard = await findDashcard(singleQuestionFunnel.id);
      expect(
        await within(dashcard).findByTestId("funnel-chart"),
      ).toBeInTheDocument();
      expect(
        within(dashcard).getByTestId("legend-caption-title"),
      ).toHaveTextContent("UXW-2692 Visualizer Funnel");
      await clickDashcardTitle(singleQuestionFunnel.id);

      await waitFor(() =>
        expect(router.location.pathname).toBe(
          `/question/${funnelQuestion.id}-uxw-2692-funnel-base`,
        ),
      );
    });
  });

  describe("creating a dashcard", () => {
    it("should navigate through the change history of the visualizer", async () => {
      await setup({ dashcards: [] });
      await editDashboard();

      const modal = await openVisualizerFromQuestionsSidebar(
        ORDERS_BY_CREATED_AT.name,
      );
      const undoButton = within(modal).getByLabelText("Undo");
      const redoButton = within(modal).getByLabelText("Redo");
      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();

      await userEvent.click(
        within(modal).getByRole("button", { name: "Add more data" }),
      );
      await userEvent.type(
        within(modal).getByPlaceholderText("Search for something"),
        "non-existing",
      );
      expect(
        await within(modal).findByText("No compatible results"),
      ).toBeInTheDocument();

      await addDataset(PRODUCTS_BY_CREATED_AT.name);
      await userEvent.click(
        within(modal).getByRole("button", { name: "Done" }),
      );

      // undo adding a data source
      expect(redoButton).toBeDisabled();
      await userEvent.click(undoButton);
      expect(undoButton).toBeDisabled();
      expect(getDataSourceNames(ALL_CARDS.map(({ name }) => name))).toEqual([
        ORDERS_BY_CREATED_AT.name,
      ]);
      expect(getWellItems("vertical-well")).toHaveLength(1);

      // redo adding a data source
      await userEvent.click(redoButton);
      expect(redoButton).toBeDisabled();
      expect(getDataSourceNames(ALL_CARDS.map(({ name }) => name))).toEqual([
        ORDERS_BY_CREATED_AT.name,
        PRODUCTS_BY_CREATED_AT.name,
      ]);
      expect(getWellItems("vertical-well")).toHaveLength(2);

      // remove the Count column of the second data source
      const productsSource = getDataSourceItem(PRODUCTS_BY_CREATED_AT.name);
      const productsCount = getColumnListItem(productsSource, "Count");
      await userEvent.click(within(productsCount).getByLabelText("Remove"));
      expect(getWellItems("vertical-well")).toEqual(["Count"]);

      expect(redoButton).toBeDisabled();
      await userEvent.click(undoButton);
      expect(getWellItems("vertical-well")).toEqual([
        "Count",
        `Count (${PRODUCTS_BY_CREATED_AT.name})`,
      ]);
      await userEvent.click(redoButton);
      expect(redoButton).toBeDisabled();
      expect(getWellItems("vertical-well")).toEqual(["Count"]);

      // a goal line is a settings change
      const settingsButton = within(modal).getByRole("button", {
        name: "Settings",
      });
      await userEvent.click(settingsButton);
      expect(settingsButton).toHaveAttribute("aria-pressed", "true");
      const canvas = within(modal).getByTestId("visualization-canvas");
      expect(getGoalLine(canvas)).not.toBeInTheDocument();
      await userEvent.click(
        within(within(modal).getByTestId("chartsettings-sidebar")).getByText(
          "Goal line",
        ),
      );
      await waitFor(() => expect(getGoalLine(canvas)).toBeInTheDocument());

      await userEvent.click(undoButton);
      await waitFor(() => expect(getGoalLine(canvas)).not.toBeInTheDocument());
      // the open settings sidebar isn't part of the history
      expect(settingsButton).toHaveAttribute("aria-pressed", "true");

      await userEvent.click(redoButton);
      await waitFor(() => expect(getGoalLine(canvas)).toBeInTheDocument());

      await saveVisualizer("Add to dashboard");

      const dashcard = await findDashcardByTitle(ORDERS_BY_CREATED_AT.name);
      await userEvent.click(
        await within(dashcard).findByLabelText("Edit visualization"),
      );
      const reopenedModal = await findVisualizerModal();
      expect(within(reopenedModal).getByLabelText("Undo")).toBeDisabled();
      expect(within(reopenedModal).getByLabelText("Redo")).toBeDisabled();
      expect(
        within(reopenedModal).getByRole("button", { name: "Settings" }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(getWellItems("vertical-well")).toEqual(["Count"]);
      expect(
        getGoalLine(within(reopenedModal).getByTestId("visualization-canvas")),
      ).toBeInTheDocument();
    });

    it("should store only the explicit settings of a new dashcard (VIZ-905)", async () => {
      const { unmount } = await setup({ dashcards: [] });
      await editDashboard();

      await openVisualizerFromQuestionsSidebar(ORDERS_BY_CREATED_AT.name);
      await addDataset(PRODUCTS_BY_CREATED_AT.name);
      expect(getWellItems("vertical-well")).toEqual([
        "Count",
        `Count (${PRODUCTS_BY_CREATED_AT.name})`,
      ]);
      await saveVisualizer("Add to dashboard");
      await saveDashboard();

      const [savedDashcard] = getSavedDashcards();
      expect(savedDashcard).toMatchObject({
        card_id: ORDERS_BY_CREATED_AT.id,
        series: [expect.objectContaining({ id: PRODUCTS_BY_CREATED_AT.id })],
      });
      expect(getSavedVisualization(savedDashcard.id)).toHaveProperty(
        "settings",
        {
          "graph.dimensions": ["COLUMN_1", "COLUMN_4"],
          "graph.metrics": ["COLUMN_2", "COLUMN_3"],
        },
      );

      unmount();
      await renderDashboard();
      const legend = await within(
        await findDashcardByTitle(ORDERS_BY_CREATED_AT.name),
      ).findByLabelText("Legend");
      expect(
        within(legend).getByText(ORDERS_BY_CREATED_AT.name),
      ).toBeInTheDocument();
      expect(
        within(legend).getByText(PRODUCTS_BY_CREATED_AT.name),
      ).toBeInTheDocument();
    });

    it("should add a data source to a dashcard after it is created (VIZ-926)", async () => {
      const { unmount } = await setup({ dashcards: [] });
      await editDashboard();

      await openVisualizerFromQuestionsSidebar(ORDERS_BY_CREATED_AT.name);
      await saveVisualizer("Add to dashboard");
      const newDashcard = await findDashcardByTitle(ORDERS_BY_CREATED_AT.name);
      await waitFor(() =>
        expect(
          within(newDashcard).getByText("Created At: Month"),
        ).toBeInTheDocument(),
      );
      await saveDashboard();

      const [createdDashcard] = getSavedDashcards();
      expect(createdDashcard.id).toBeLessThan(0);
      expect(getSeriesCardIds(createdDashcard.series)).toEqual([]);

      await editDashboard();
      const savedDashcard = await findDashcardByTitle(
        ORDERS_BY_CREATED_AT.name,
      );
      await userEvent.click(
        await within(savedDashcard).findByLabelText("Edit visualization"),
      );
      await findVisualizerModal();
      await addDataset(PRODUCTS_BY_CREATED_AT.name);
      expect(getWellItems("vertical-well")).toHaveLength(2);
      await saveVisualizer();

      const assertBothSeriesShown = async () => {
        const dashcard = await findDashcardByTitle(ORDERS_BY_CREATED_AT.name);
        const legend = await within(dashcard).findByLabelText("Legend");
        expect(
          within(legend).getByText(ORDERS_BY_CREATED_AT.name),
        ).toBeInTheDocument();
        expect(
          within(legend).getByText(PRODUCTS_BY_CREATED_AT.name),
        ).toBeInTheDocument();
        expect(
          within(dashcard).getByTestId("legend-caption-title"),
        ).toHaveTextContent(ORDERS_BY_CREATED_AT.name);
        expect(
          within(dashcard).getByText("Created At: Month"),
        ).toBeInTheDocument();
      };
      await assertBothSeriesShown();

      await saveDashboard();
      const [updatedDashcard] = getSavedDashcards();
      expect(updatedDashcard).toMatchObject({
        id: FIRST_NEW_DASHCARD_ID,
        card_id: ORDERS_BY_CREATED_AT.id,
        series: [expect.objectContaining({ id: PRODUCTS_BY_CREATED_AT.id })],
      });
      await assertBothSeriesShown();

      unmount();
      await renderDashboard();
      await assertBothSeriesShown();
      const queryTargets = fetchMock.callHistory
        .calls("dashcard-query")
        .map(({ url }) => new URL(url).pathname);
      for (const card of [ORDERS_BY_CREATED_AT, PRODUCTS_BY_CREATED_AT]) {
        expect(queryTargets).toContain(
          `/api/dashboard/${DASHBOARD_ID}/dashcard/${FIRST_NEW_DASHCARD_ID}/card/${card.id}/query`,
        );
      }
    });

    it("should build a funnel from step and views columns", async () => {
      await setup({ dashcards: [] });
      await editDashboard();

      const modal = await openVisualizerFromQuestionsSidebar(STEP_COLUMN.name);
      await userEvent.click(
        within(within(modal).getByTestId("viz-picker-main")).getByTestId(
          "funnel",
        ),
      );
      await addDataset(VIEWS_COLUMN.name);
      expect(
        fetchMock.callHistory
          .calls("card-query")
          .map(({ url }) => new URL(url).pathname),
      ).toContain(`/api/card/${VIEWS_COLUMN.id}/query`);
      await userEvent.click(
        within(modal).getByRole("button", { name: "Done" }),
      );

      const STEP_ITEMS = [
        "Step",
        "Landing page",
        "Checkout page",
        "Payment done page",
      ];
      expect(getColumnSelection(STEP_COLUMN.name, "Step")).toBe("true");
      expect(getColumnSelection(VIEWS_COLUMN.name, "Views")).toBe("true");
      expect(getWellItems("vertical-well")).toEqual(["Views"]);
      expect(getWellItems("horizontal-well")).toEqual(STEP_ITEMS);

      // remove a column in the data manager
      await userEvent.click(
        within(
          getColumnListItem(getDataSourceItem(STEP_COLUMN.name), "Step"),
        ).getByLabelText("Remove"),
      );
      expect(getColumnSelection(STEP_COLUMN.name, "Step")).toBe("false");
      expect(getWellItems("vertical-well")).toEqual(["Views"]);
      expect(getWellItems("horizontal-well")).toEqual(["(empty)"]);

      // add it back
      await userEvent.click(
        getColumnListItem(getDataSourceItem(STEP_COLUMN.name), "Step"),
      );
      expect(getColumnSelection(STEP_COLUMN.name, "Step")).toBe("true");
      expect(getWellItems("vertical-well")).toEqual(["Views"]);
      expect(getWellItems("horizontal-well")).toEqual(STEP_ITEMS);

      // remove the metric in its well
      await userEvent.click(
        within(
          within(screen.getByTestId("vertical-well")).getByTestId("well-item"),
        ).getByLabelText("Remove"),
      );
      expect(getColumnSelection(VIEWS_COLUMN.name, "Views")).toBe("false");
      expect(getColumnSelection(STEP_COLUMN.name, "Step")).toBe("true");
      expect(getWellItems("vertical-well")).toEqual([]);
      expect(getWellItems("horizontal-well")).toEqual(STEP_ITEMS);

      // remove the dimension in its well
      const dimensionItem = getItemWithText(
        within(screen.getByTestId("horizontal-well")).getAllByTestId(
          "well-item",
        ),
        "Step",
      );
      await userEvent.click(within(dimensionItem).getByLabelText("Remove"));
      expect(getColumnSelection(STEP_COLUMN.name, "Step")).toBe("false");
      expect(getWellItems("vertical-well")).toEqual([]);
      expect(getWellItems("horizontal-well")).toEqual([]);

      // rebuild the funnel
      await userEvent.click(
        getColumnListItem(getDataSourceItem(STEP_COLUMN.name), "Step"),
      );
      await userEvent.click(
        getColumnListItem(getDataSourceItem(VIEWS_COLUMN.name), "Views"),
      );
      expect(getColumnSelection(STEP_COLUMN.name, "Step")).toBe("true");
      expect(getColumnSelection(VIEWS_COLUMN.name, "Views")).toBe("true");
      expect(getWellItems("vertical-well")).toEqual(["Views"]);
      expect(getWellItems("horizontal-well")).toEqual(STEP_ITEMS);

      // remove a data source
      await userEvent.click(
        within(getDataSourceItem(VIEWS_COLUMN.name)).getAllByLabelText(
          "Remove",
        )[0],
      );
      const importer = screen.getByTestId("visualizer-data-importer");
      expect(
        within(importer).queryByText(VIEWS_COLUMN.name),
      ).not.toBeInTheDocument();
      expect(within(importer).queryByText("Views")).not.toBeInTheDocument();
      expect(within(importer).getByText(STEP_COLUMN.name)).toBeInTheDocument();
      expect(getWellItems("vertical-well")).toEqual([]);
      expect(getWellItems("horizontal-well")).toEqual(STEP_ITEMS);
    });

    it("should build a funnel of several scalar cards (VIZ-678)", async () => {
      const scalarCard = (id: number, name: string) =>
        createMockCard({
          id,
          name,
          display: "scalar",
          dataset_query: VIEWS_COLUMN.dataset_query,
        });
      const LANDING_PAGE = scalarCard(50, "Landing Page");
      const CHECKOUT_PAGE = scalarCard(51, "Checkout Page");
      const PAYMENT_DONE_PAGE = scalarCard(52, "Payment Done Page");
      const SCALAR_CARDS = [LANDING_PAGE, CHECKOUT_PAGE, PAYMENT_DONE_PAGE];
      const viewsDataset = (views: number) =>
        createMockDataset({
          data: createMockDatasetData({
            cols: [
              createMockNumericColumn({ name: "views", display_name: "views" }),
            ],
            rows: [[views]],
          }),
        });
      await setup({
        dashcards: [],
        cards: [...ALL_CARDS, ...SCALAR_CARDS],
        datasets: {
          ...DATASETS,
          [LANDING_PAGE.id]: viewsDataset(1000),
          [CHECKOUT_PAGE.id]: viewsDataset(600),
          [PAYMENT_DONE_PAGE.id]: viewsDataset(100),
        },
      });
      await editDashboard();

      const modal = await openVisualizerFromQuestionsSidebar(LANDING_PAGE.name);
      await addDataset(CHECKOUT_PAGE.name);
      await addDataset(PAYMENT_DONE_PAGE.name);

      const ALL_PAGES = SCALAR_CARDS.map(({ name }) => name);
      const verticalWell = screen.getByTestId("vertical-well");
      const horizontalWell = screen.getByTestId("horizontal-well");
      const expectNoArtificialColumns = () => {
        expect(
          within(verticalWell).queryByText("METRIC"),
        ).not.toBeInTheDocument();
        expect(
          within(horizontalWell).queryByText("DIMENSION"),
        ).not.toBeInTheDocument();
      };
      expectNoArtificialColumns();
      expect(getWellItems("vertical-well")).toEqual([]);
      expect(getWellItems("horizontal-well")).toEqual(ALL_PAGES);

      await userEvent.click(
        within(modal).getByRole("button", { name: "Done" }),
      );
      for (const name of ALL_PAGES) {
        expect(getColumnSelection(name, "views")).toBe("true");
      }

      const toggleViews = async (dataSourceName: string, selected: boolean) => {
        const item = getColumnListItem(
          getDataSourceItem(dataSourceName),
          "views",
        );
        await userEvent.click(
          selected ? item : within(item).getByLabelText("Remove"),
        );
      };

      // remove a column in the data manager
      await toggleViews(CHECKOUT_PAGE.name, false);
      expect(getColumnSelection(CHECKOUT_PAGE.name, "views")).toBe("false");
      expect(getColumnSelection(LANDING_PAGE.name, "views")).toBe("true");
      expectNoArtificialColumns();
      expect(getWellItems("horizontal-well")).toEqual([
        LANDING_PAGE.name,
        PAYMENT_DONE_PAGE.name,
      ]);

      // add it back
      await toggleViews(CHECKOUT_PAGE.name, true);
      expect(getColumnSelection(CHECKOUT_PAGE.name, "views")).toBe("true");
      expectNoArtificialColumns();
      expect(getWellItems("horizontal-well")).toHaveLength(3);
      expect(getWellItems("horizontal-well")).toEqual(
        expect.arrayContaining(ALL_PAGES),
      );

      for (const name of ALL_PAGES) {
        await toggleViews(name, false);
      }
      expect(getWellItems("vertical-well")).toEqual([]);
      expect(getWellItems("horizontal-well")).toEqual([]);

      // rebuild the funnel
      for (const name of ALL_PAGES) {
        await toggleViews(name, true);
      }
      for (const name of ALL_PAGES) {
        expect(getColumnSelection(name, "views")).toBe("true");
      }
      expectNoArtificialColumns();
      expect(getWellItems("vertical-well")).toEqual([]);
      expect(getWellItems("horizontal-well")).toEqual(ALL_PAGES);
    });
  });

  describe("broken data sources", () => {
    const BASE_QUESTION = createMockCard({
      id: 40,
      name: "Base question",
      display: "scalar",
      dataset_query: STRUCTURED_QUERY,
    });
    const INVALID_QUESTION = createMockCard({
      id: 41,
      name: "Invalid question",
      display: "scalar",
      dataset_query: STRUCTURED_QUERY,
    });
    const scalarDataset = (value: number) =>
      createMockDataset({
        data: createMockDatasetData({
          cols: [createMockNumericColumn({ name: "1", display_name: "1" })],
          rows: [[value]],
        }),
      });
    // H2 runs the "broken" `SELECT --2` of the e2e test and returns no columns
    const noColumnsDataset = createMockDataset({
      data: createMockDatasetData({ cols: [], rows: [] }),
    });
    const CARDS = [...ALL_CARDS, BASE_QUESTION, INVALID_QUESTION];
    const FUNNEL_DASHCARD_WITH_INVALID_QUESTION =
      createMockVisualizerDashboardCard({
        id: 43,
        dashboard_id: DASHBOARD_ID,
        card_id: BASE_QUESTION.id,
        card: BASE_QUESTION,
        series: [INVALID_QUESTION],
        size_x: 16,
        size_y: 10,
        visualization_settings: {
          visualization: {
            display: "funnel",
            columnValuesMapping: {
              METRIC: [
                columnRef("COLUMN_1", "1", BASE_QUESTION),
                columnRef("COLUMN_2", "1", INVALID_QUESTION),
              ],
              DIMENSION: [
                `$_card:${BASE_QUESTION.id}_name`,
                `$_card:${INVALID_QUESTION.id}_name`,
              ],
            },
            settings: {
              "funnel.metric": "METRIC",
              "funnel.dimension": "DIMENSION",
            },
          },
        },
      });

    it("should add a second question to a scalar dashcard (metabase#22265)", async () => {
      const baseDashcard = createMockDashboardCard({
        id: 42,
        dashboard_id: DASHBOARD_ID,
        card_id: BASE_QUESTION.id,
        card: BASE_QUESTION,
        size_x: 16,
        size_y: 10,
      });
      const { unmount } = await setup({
        dashcards: [baseDashcard],
        cards: CARDS,
        datasets: {
          ...DATASETS,
          [BASE_QUESTION.id]: scalarDataset(1),
          [INVALID_QUESTION.id]: scalarDataset(1),
        },
      });
      await editDashboard();

      const modal = await openVisualizer(
        baseDashcard.id,
        "Visualize another way",
      );
      await addDataset(INVALID_QUESTION.name);
      expect(
        await within(modal).findByTestId("funnel-chart"),
      ).toHaveTextContent(INVALID_QUESTION.name);

      const metadataCallsBefore = fetchMock.callHistory.calls(
        "express:/api/card/:cardId/query_metadata",
      ).length;
      await saveVisualizer();

      await waitFor(() =>
        expect(
          fetchMock.callHistory
            .calls("express:/api/card/:cardId/query_metadata")
            .slice(metadataCallsBefore)
            .map(({ url }) => new URL(url).pathname)
            .sort(),
        ).toEqual([
          `/api/card/${BASE_QUESTION.id}/query_metadata`,
          `/api/card/${INVALID_QUESTION.id}/query_metadata`,
        ]),
      );
      await saveDashboard();
      unmount();
      await renderDashboard();
      expect(
        await within(getDashcard(baseDashcard.id)).findByText(
          INVALID_QUESTION.name,
        ),
      ).toBeInTheDocument();
      expect(getSavedVisualization(baseDashcard.id)).toMatchObject({
        display: "funnel",
        settings: {
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        },
      });
    });

    it("should edit a dashcard whose added question has lost its columns (metabase#22265, VIZ-676)", async () => {
      const funnelDashcard = FUNNEL_DASHCARD_WITH_INVALID_QUESTION;
      await setup({
        dashcards: [funnelDashcard],
        cards: CARDS,
        datasets: {
          ...DATASETS,
          [BASE_QUESTION.id]: scalarDataset(1),
          [INVALID_QUESTION.id]: noColumnsDataset,
        },
      });
      await editDashboard();

      const dashcard = await findDashcard(funnelDashcard.id);
      // the dashcard title and the funnel step
      await waitFor(() =>
        expect(within(dashcard).getAllByText(BASE_QUESTION.name)).toHaveLength(
          2,
        ),
      );
      expect(
        within(dashcard).getByText(INVALID_QUESTION.name),
      ).toBeInTheDocument();
      expect(within(dashcard).getByText("1")).toBeInTheDocument();

      await userEvent.click(
        within(dashcard).getByLabelText("Edit visualization"),
      );
      await findVisualizerModal();
      await waitFor(() =>
        expect(getDataSourceNames(CARDS.map(({ name }) => name))).toEqual([
          BASE_QUESTION.name,
          INVALID_QUESTION.name,
        ]),
      );
    });

    // Remove .failing once a failed series no longer hides "Edit visualization"
    it.failing(
      "should edit a dashcard whose added question fails to run (metabase#22265)",
      async () => {
        const funnelDashcard = FUNNEL_DASHCARD_WITH_INVALID_QUESTION;
        await setup({
          dashcards: [funnelDashcard],
          cards: CARDS,
          datasets: {
            ...DATASETS,
            [BASE_QUESTION.id]: scalarDataset(1),
            // the backend's error shape (catch_exceptions.clj)
            [INVALID_QUESTION.id]: createMockDataset({
              status: "failed",
              error: "Syntax error",
              data: createMockDatasetData({ cols: [], rows: [] }),
            }),
          },
        });
        await editDashboard();

        const dashcard = await findDashcard(funnelDashcard.id);
        expect(
          await within(dashcard).findByText(
            "Some columns are missing, this card might not render correctly.",
          ),
        ).toBeInTheDocument();
        expect(
          within(dashcard).getByLabelText("Edit visualization"),
        ).toBeInTheDocument();
      },
    );
  });

  describe("drill-through", () => {
    const ORDERS_COLOR = "#509EE3";
    const PRODUCTS_LINE_COLOR = "#88BF4D";
    const PRODUCTS_BAR_COLOR = "#EF8C8C";

    async function setupDrills() {
      const view = await setup({
        dashcards: VISUALIZER_DASHBOARD_DASHCARDS,
        datasets: DATASETS_WITH_FIELD_REFS,
      });
      return view;
    }

    it("should drill into the series of a timeseries chart that is clicked (VIZ-979)", async () => {
      const { router } = await setupDrills();
      const dashcard = await findDashcard(MULTI_SERIES_LINE_DASHCARD.id);

      clickChartElement(dashcard, {
        type: "path",
        color: PRODUCTS_LINE_COLOR,
        index: 1,
      });
      await userEvent.click(
        within(await findClickActions()).getByText("See these Products"),
      );

      expect(await findDrilledQuestion(router)).toEqual({
        originalCardId: PRODUCTS_BY_CREATED_AT.id,
        display: "table",
        sourceTableId: PRODUCTS_ID,
        filters: ["Created At is Feb 1–29, 2024"],
        aggregations: [],
        breakouts: [],
      });
    });

    it("should break out the clicked point of the first series of a timeseries chart (VIZ-979)", async () => {
      const { router } = await setupDrills();
      const dashcard = await findDashcard(MULTI_SERIES_LINE_DASHCARD.id);

      clickChartElement(dashcard, {
        type: "path",
        color: ORDERS_COLOR,
        index: 1,
      });
      const clickActions = await findClickActions();
      await userEvent.click(within(clickActions).getByText("Break out by…"));
      await userEvent.click(
        within(await findClickActions()).getByText("Category"),
      );
      const columnPicker = screen.getByTestId("click-actions-popover");
      await userEvent.click(within(columnPicker).getByText("User"));
      await userEvent.click(await within(columnPicker).findByText("Source"));

      expect(await findDrilledQuestion(router)).toEqual({
        originalCardId: ORDERS_BY_CREATED_AT.id,
        display: "bar",
        sourceTableId: ORDERS_ID,
        filters: ["Created At is Feb 1–29, 2024"],
        aggregations: ["Count"],
        breakouts: ["User → Source"],
      });
    });

    it.each([
      {
        name: ORDERS_BY_CREATED_AT.name,
        path: `/question/${ORDERS_BY_CREATED_AT.id}-orders-by-created-at-month`,
      },
      {
        name: PRODUCTS_BY_CREATED_AT.name,
        path: `/question/${PRODUCTS_BY_CREATED_AT.id}-products-by-created-at-month`,
      },
    ])(
      "should open the question of the legend item $name (VIZ-979)",
      async ({ name, path }) => {
        const { router } = await setupDrills();
        const dashcard = await findDashcard(MULTI_SERIES_LINE_DASHCARD.id);

        const legend = within(dashcard).getByLabelText("Legend");
        await userEvent.click(within(legend).getByText(name));

        await waitFor(() => expect(router.location.pathname).toBe(path));
      },
    );

    it("should drill into the series of a category chart that is clicked (VIZ-979)", async () => {
      const { router } = await setupDrills();
      const dashcard = await findDashcard(MULTI_SERIES_BAR_DASHCARD.id);

      clickChartElement(dashcard, {
        type: "rect",
        color: ORDERS_COLOR,
        index: 1,
      });
      await userEvent.click(
        within(await findClickActions()).getByText("See these Orders"),
      );

      expect(await findDrilledQuestion(router)).toEqual({
        originalCardId: ORDERS_BY_CATEGORY.id,
        display: "table",
        sourceTableId: ORDERS_ID,
        filters: ["Product → Category is Gadget"],
        aggregations: [],
        breakouts: [],
      });
    });

    it("should filter by the value of the second series of a category chart (VIZ-979)", async () => {
      const { router } = await setupDrills();
      const dashcard = await findDashcard(MULTI_SERIES_BAR_DASHCARD.id);

      clickChartElement(dashcard, {
        type: "rect",
        color: PRODUCTS_BAR_COLOR,
        index: 2,
      });
      await userEvent.click(
        within(await findClickActions()).getByRole("button", { name: ">" }),
      );

      expect(await findDrilledQuestion(router)).toEqual({
        originalCardId: PRODUCTS_BY_CATEGORY.id,
        display: "bar",
        sourceTableId: PRODUCTS_ID,
        filters: ["Count is greater than 7"],
        aggregations: [],
        breakouts: [],
      });
    });

    it("should drill into the clicked slice of a pie chart (VIZ-979)", async () => {
      const { router } = await setupDrills();
      const dashcard = await findDashcard(PIE_DASHCARD.id);

      clickChartElement(dashcard, {
        type: "sector",
        color: "#F9D45C",
        index: 0,
      });
      await userEvent.click(
        within(await findClickActions()).getByText("See these Products"),
      );

      expect(await findDrilledQuestion(router)).toEqual({
        originalCardId: PRODUCTS_BY_CATEGORY.id,
        display: "table",
        sourceTableId: PRODUCTS_ID,
        filters: ["Category is Gadget"],
        aggregations: [],
        breakouts: [],
      });
    });

    it("should brush filter a single-series timeseries chart but not a multi-series one (VIZ-979)", async () => {
      const { router } = await setupDrills();
      const multiSeries = await findDashcard(MULTI_SERIES_LINE_DASHCARD.id);
      const singleSeries = await findDashcard(REGULAR_LINE_DASHCARD.id);
      // the brush is turned on once the chart has rendered
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

      brushChart(
        multiSeries,
        { type: "path", color: ORDERS_COLOR, index: 1 },
        { type: "path", color: ORDERS_COLOR, index: 2 },
      );
      expect(router.location.pathname).toBe(`/dashboard/${DASHBOARD_ID}`);

      brushChart(
        singleSeries,
        { type: "rect", color: ORDERS_COLOR, index: 4 },
        { type: "rect", color: ORDERS_COLOR, index: 10 },
      );

      expect(await findDrilledQuestion(router)).toEqual({
        originalCardId: PRODUCTS_BY_CREATED_AT.id,
        display: "bar",
        sourceTableId: PRODUCTS_ID,
        filters: ["Created At is May 1, 12:00 AM – Nov 1, 2024, 12:00 AM"],
        aggregations: ["Count"],
        breakouts: ["Created At: Month"],
      });
    });
  });

  describe("cartesian and pie charts", () => {
    it("should change cartesian and pie viz settings (metabase#61197)", async () => {
      await setup({ dashcards: [MULTI_SERIES_LINE_DASHCARD, PIE_DASHCARD] });
      await editDashboard();

      const modal = await openVisualizer(
        MULTI_SERIES_LINE_DASHCARD.id,
        "Edit visualization",
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Settings" }),
      );
      const getSidebar = () =>
        within(modal).getByTestId("chartsettings-sidebar");
      const canvas = within(modal).getByTestId("visualization-canvas");

      expect(getGoalLine(canvas)).not.toBeInTheDocument();
      await userEvent.click(within(getSidebar()).getByText("Goal line"));
      await waitFor(() => expect(getGoalLine(canvas)).toBeInTheDocument());

      expect(getTrendLines(canvas)).toHaveLength(0);
      await userEvent.click(within(getSidebar()).getByText("Trend line"));
      await waitFor(() => expect(getTrendLines(canvas)).toHaveLength(2));

      expect(
        within(within(modal).getByLabelText("Legend")).getByText(
          PRODUCTS_BY_CREATED_AT.name,
        ),
      ).toBeInTheDocument();

      const seriesSettings =
        within(getSidebar()).getByTestId("series-settings");
      const secondSeriesName =
        within(seriesSettings).getAllByTestId("series-name-input")[1];
      expect(secondSeriesName).toHaveValue(PRODUCTS_BY_CREATED_AT.name);
      await userEvent.clear(secondSeriesName);
      await userEvent.type(secondSeriesName, "Series B");
      await userEvent.tab();

      expect(getPathsWithFill(canvas, SERIES_B_COLOR)).toHaveLength(0);
      await userEvent.click(
        within(seriesSettings).getAllByRole("img", {
          name: "chevrondown icon",
        })[1],
      );
      const displayTypes = within(seriesSettings).getByTestId(
        "chart-settings-widget-display",
      );
      // On 65, the display types are icon buttons, and the selected one is filled
      expect(
        within(displayTypes).getByRole("button", { name: "line icon" }),
      ).toHaveAttribute("data-variant", "filled");
      await userEvent.click(
        within(displayTypes).getByRole("button", { name: "bar icon" }),
      );
      await userEvent.click(
        within(
          within(seriesSettings).getAllByTestId("color-selector-button")[1],
        ).getByRole("button"),
      );
      await userEvent.click(
        within(await screen.findByTestId("color-selector-popover")).getByRole(
          "button",
          { name: SERIES_B_COLOR },
        ),
      );

      const assertUpdatedSettingsApplied = async (container: HTMLElement) => {
        await waitFor(() =>
          expect(getPathsWithFill(container, SERIES_B_COLOR)).not.toHaveLength(
            0,
          ),
        );
        expect(getGoalLine(container)).toBeInTheDocument();
        expect(getTrendLines(container)).toHaveLength(2);
        const legend = within(container).getByLabelText("Legend");
        expect(within(legend).getByText("Series B")).toBeInTheDocument();
        expect(
          within(legend).queryByText(PRODUCTS_BY_CREATED_AT.name),
        ).not.toBeInTheDocument();
      };
      await assertUpdatedSettingsApplied(modal);

      await saveVisualizer();
      await assertUpdatedSettingsApplied(
        await findDashcard(MULTI_SERIES_LINE_DASHCARD.id),
      );

      // pie chart
      expect(
        await within(await findDashcard(PIE_DASHCARD.id)).findByText("Total"),
      ).toBeInTheDocument();
      const pieModal = await openVisualizer(
        PIE_DASHCARD.id,
        "Edit visualization",
      );
      await userEvent.click(
        within(pieModal).getByRole("button", { name: "Settings" }),
      );
      const pieSidebar = within(pieModal).getByTestId("chartsettings-sidebar");
      await userEvent.click(within(pieSidebar).getByText("Display"));
      const getPieChart = () => within(pieModal).getByTestId("chart-container");
      expect(within(getPieChart()).getByText(PIE_TOTAL)).toBeInTheDocument();
      expect(within(getPieChart()).getByText("Total")).toBeInTheDocument();
      await userEvent.click(within(pieSidebar).getByText("Show total"));
      await waitFor(() =>
        expect(
          within(getPieChart()).queryByText("Total"),
        ).not.toBeInTheDocument(),
      );
      expect(getPieSlices(getPieChart())).toHaveLength(4);
      expect(
        within(getPieChart()).queryByText(PIE_TOTAL),
      ).not.toBeInTheDocument();
      await saveVisualizer();

      const getDashcardPieChart = () =>
        within(getDashcard(PIE_DASHCARD.id)).getByTestId("chart-container");
      await waitFor(() =>
        expect(getPieSlices(getDashcardPieChart())).toHaveLength(4),
      );
      expect(
        within(getDashcardPieChart()).queryByText("Total"),
      ).not.toBeInTheDocument();
      expect(
        within(getDashcardPieChart()).queryByText(PIE_TOTAL),
      ).not.toBeInTheDocument();
    });

    it("should build a chart from a non-cartesian chart without its pivot grouping column (VIZ-668)", async () => {
      await setup({
        dashcards: [],
        cards: CARTESIAN_CARDS,
        datasets: CARTESIAN_DATASETS,
      });
      await editDashboard();

      const modal = await openVisualizerFromQuestionsSidebar(PIVOT_TABLE.name);
      await addDataset(ORDERS_BY_CREATED_AT.name);
      await userEvent.click(
        within(modal).getByRole("button", { name: "Done" }),
      );
      await userEvent.click(
        getColumnListItem(
          getDataSourceItem(ORDERS_BY_CREATED_AT.name),
          "Count",
        ),
      );

      const pivotSource = getDataSourceItem(PIVOT_TABLE.name);
      expect(getColumnListItem(pivotSource, "Count")).toBeInTheDocument();
      expect(
        within(pivotSource).getByText("Average of Quantity"),
      ).toBeInTheDocument();
      expect(
        within(pivotSource).queryByText("pivot-grouping"),
      ).not.toBeInTheDocument();

      expect(getWellItems("vertical-well")).toEqual([
        "Count",
        `Count (${ORDERS_BY_CREATED_AT.name})`,
      ]);
      expect(getWellItems("horizontal-well")).toEqual(["Created At: Year"]);
      expect(getLegendItemNames(modal)).toHaveLength(2);
    });

    it("should keep all dimensions when changing to another cartesian chart (VIZ-648)", async () => {
      await setup({
        dashcards: [],
        cards: CARTESIAN_CARDS,
        datasets: CARTESIAN_DATASETS,
      });
      await editDashboard();

      const modal = await openVisualizerFromQuestionsSidebar(
        ORDERS_BY_CREATED_AT_AND_CATEGORY.name,
      );
      await userEvent.click(
        within(within(modal).getByTestId("viz-picker-main")).getByTestId(
          "area",
        ),
      );

      expectCurrentDisplay(modal, "area");
      for (const column of [
        "Count",
        "Created At: Month",
        "Product → Category",
      ]) {
        expectColumnSelected(ORDERS_BY_CREATED_AT_AND_CATEGORY.name, column);
      }
      expect(getWellItems("horizontal-well")).toEqual([
        "Created At: Month",
        "Product → Category",
      ]);
    });

    it("should keep the default color of a question's series (VIZ-1211)", async () => {
      await setup({ dashcards: [] });
      await editDashboard();

      await userEvent.click(screen.getByLabelText("Add questions"));
      const sidebar = await screen.findByTestId("add-card-sidebar");
      await userEvent.click(
        await within(sidebar).findByRole("menuitem", {
          name: ORDERS_BY_CATEGORY.name,
        }),
      );
      const dashcard = await findDashcardByTitle(ORDERS_BY_CATEGORY.name);
      await userEvent.click(
        await within(dashcard).findByLabelText("Visualize another way"),
      );
      const modal = await findVisualizerModal();

      const canvas = within(modal).getByTestId("visualization-canvas");
      await waitFor(() =>
        expect(getPathsWithFill(canvas, DEFAULT_SERIES_COLOR)).toHaveLength(4),
      );
    });

    it("should remap columns when changing the display to pie and funnel", async () => {
      await setup({ dashcards: [] });
      await editDashboard();

      const modal = await openVisualizerFromQuestionsSidebar(
        ORDERS_BY_CATEGORY.name,
      );
      const vizPicker = within(modal).getByTestId("viz-picker-main");

      await userEvent.click(within(vizPicker).getByTestId("pie"));
      expectColumnSelected(ORDERS_BY_CATEGORY.name, "Count");
      expectColumnSelected(ORDERS_BY_CATEGORY.name, "Product → Category");
      expect(getWellItems("pie-metric-well")).toEqual(["Count"]);
      expect(getWellItems("pie-dimension-well")).toEqual([
        "Product → Category",
      ]);
      // the sum of the Orders by Product Category counts
      await waitFor(() =>
        expect(
          within(within(modal).getByTestId("chart-container")).getByText("10"),
        ).toBeInTheDocument(),
      );

      await userEvent.click(within(vizPicker).getByTestId("funnel"));
      expectColumnSelected(ORDERS_BY_CATEGORY.name, "Count");
      expectColumnSelected(ORDERS_BY_CATEGORY.name, "Product → Category");
      expect(getWellItems("vertical-well")).toEqual(["Count"]);
      expect(getWellItems("horizontal-well")).toEqual([
        "Product → Category",
        "Doohickey",
        "Gadget",
        "Gizmo",
        "Widget",
      ]);
    });

    it("should keep the column mapping when switching between cartesian, pie and funnel", async () => {
      await setup({
        dashcards: [],
        cards: CARTESIAN_CARDS,
        datasets: CARTESIAN_DATASETS,
      });
      await editDashboard();

      const modal = await openVisualizerFromQuestionsSidebar(
        ACCOUNTS_BY_COUNTRY.name,
      );
      const vizPicker = within(modal).getByTestId("viz-picker-main");
      const selectDisplay = (display: string) =>
        userEvent.click(within(vizPicker).getByTestId(display));
      const expectCartesianWells = () => {
        expect(getWellItems("horizontal-well")).toEqual(["Country"]);
        expect(getWellItems("vertical-well")).toEqual(["Count"]);
      };
      const expectFunnelWells = () => {
        expect(getWellItems("horizontal-well")).toEqual([
          "Country",
          ...COUNTRY_STEPS,
        ]);
        expect(getWellItems("vertical-well")).toEqual(["Count"]);
      };

      expectCartesianWells();

      // cartesian -> funnel -> scatter
      await selectDisplay("funnel");
      expectFunnelWells();
      await selectDisplay("scatter");
      expectCartesianWells();

      await userEvent.click(within(modal).getByLabelText("Undo"));
      await userEvent.click(within(modal).getByLabelText("Undo"));
      expectCurrentDisplay(modal, "bar");

      // cartesian -> pie -> funnel -> scatter
      await selectDisplay("pie");
      expect(getWellItems("pie-dimension-well")).toEqual(["Country"]);
      expect(getWellItems("pie-metric-well")).toEqual(["Count"]);
      await selectDisplay("funnel");
      expectFunnelWells();
      await selectDisplay("scatter");
      expectCartesianWells();
    });

    it("should handle implicit viz settings of a pivot table (VIZ-947)", async () => {
      await setup({
        dashcards: [],
        cards: CARTESIAN_CARDS,
        datasets: CARTESIAN_DATASETS,
      });
      await editDashboard();

      const modal = await openVisualizerFromQuestionsSidebar(PIVOT_TABLE.name);
      const canvas = () => within(modal).getByTestId("visualization-canvas");
      const expectSelectedColumns = (selected: Record<string, boolean>) =>
        Object.entries(selected).forEach(([column, isSelected]) =>
          expectColumnSelected(PIVOT_TABLE.name, column, isSelected),
        );
      const clickColumn = (column: string) =>
        userEvent.click(
          getColumnListItem(getDataSourceItem(PIVOT_TABLE.name), column),
        );
      const removeColumn = (column: string) =>
        userEvent.click(
          within(
            getColumnListItem(getDataSourceItem(PIVOT_TABLE.name), column),
          ).getByLabelText("Remove"),
        );

      expectSelectedColumns({
        Count: true,
        "Average of Quantity": false,
        "Created At: Year": true,
        "Product → Category": false,
      });
      // a bar for each year
      await waitFor(() =>
        expect(getPathsWithFill(canvas(), DEFAULT_SERIES_COLOR)).toHaveLength(
          PIVOT_YEARS.length,
        ),
      );
      expect(getWellItems("vertical-well")).toEqual(["Count"]);
      expect(getWellItems("horizontal-well")).toEqual(["Created At: Year"]);

      await clickColumn("Product → Category");
      expectSelectedColumns({
        Count: true,
        "Average of Quantity": false,
        "Created At: Year": true,
        "Product → Category": true,
      });
      // a series for each category, and one for the subtotal rows
      await waitFor(() =>
        expect(getLegendItemNames(modal)).toEqual([
          ...PIVOT_CATEGORIES,
          "(empty)",
        ]),
      );
      expect(getWellItems("vertical-well")).toEqual(["Count"]);
      expect(getWellItems("horizontal-well")).toEqual([
        "Created At: Year",
        "Product → Category",
      ]);

      await clickColumn("Average of Quantity");
      expectSelectedColumns({
        Count: true,
        "Average of Quantity": true,
        "Created At: Year": true,
        "Product → Category": true,
      });
      expect(getLegendItemNames(modal)).toHaveLength(5);
      expect(getWellItems("vertical-well")).toEqual([
        "Count",
        "Average of Quantity",
      ]);
      expect(getWellItems("horizontal-well")).toHaveLength(2);

      await removeColumn("Created At: Year");
      await removeColumn("Product → Category");
      expectSelectedColumns({
        Count: true,
        "Average of Quantity": true,
        "Created At: Year": false,
        "Product → Category": false,
      });
      await waitFor(() =>
        expect(
          within(modal).queryByTestId("chart-container"),
        ).not.toBeInTheDocument(),
      );
      expect(getWellItems("vertical-well")).toHaveLength(2);
      expect(getWellItems("horizontal-well")).toEqual([]);

      await clickColumn("Created At: Year");
      expectSelectedColumns({
        Count: true,
        "Average of Quantity": true,
        "Created At: Year": true,
        "Product → Category": false,
      });
      expect(
        await within(modal).findByTestId("chart-container"),
      ).toBeInTheDocument();
      expect(getWellItems("vertical-well")).toHaveLength(2);
      expect(getWellItems("horizontal-well")).toEqual(["Created At: Year"]);
      expect(getLegendItemNames(modal)).toEqual([
        "Count",
        "Average of Quantity",
      ]);
    });

    it.each([
      {
        breakout: "timeseries",
        firstCard: ORDERS_BY_CREATED_AT,
        secondCard: PRODUCTS_BY_CREATED_AT,
        firstDimension: "Created At: Month",
        secondDimension: "Created At: Month",
        display: "line",
        chartSize: undefined,
        xAxisLabels: ["January 2024", "March 2024"],
        yAxisLabels: ["600", "10"],
        // both data sources share the dimension
        dimensionWellItems: ["Created At: Month"],
      },
      {
        breakout: "category",
        firstCard: ORDERS_BY_CATEGORY,
        secondCard: PRODUCTS_BY_CATEGORY,
        firstDimension: "Product → Category",
        secondDimension: "Category",
        display: "bar",
        xAxisLabels: ["Doohickey", "Widget"],
        chartSize: { width: 800, height: 400 },
        yAxisLabels: ["6,000", "1,000"],
        dimensionWellItems: ["Product → Category", "Category"],
      },
    ])(
      "should use the columns of a new data source with a $breakout breakout",
      async ({
        firstCard,
        secondCard,
        firstDimension,
        secondDimension,
        display,
        chartSize,
        xAxisLabels,
        yAxisLabels,
        dimensionWellItems,
      }) => {
        if (chartSize) {
          setMockExplicitSize(chartSize);
        }
        await setup({
          dashcards: [],
          cards: CARTESIAN_CARDS,
          datasets: CARTESIAN_DATASETS,
        });
        await editDashboard();

        const modal = await openVisualizerFromQuestionsSidebar(firstCard.name);
        await addDataset(secondCard.name);
        await userEvent.click(
          within(modal).getByRole("button", { name: "Done" }),
        );

        const secondCount = `Count (${secondCard.name})`;
        expect(getWellItems("vertical-well")).toEqual(["Count", secondCount]);
        expect(getWellItems("horizontal-well")).toEqual(dimensionWellItems);
        expectCurrentDisplay(modal, display);

        for (const label of [...xAxisLabels, ...yAxisLabels]) {
          await waitFor(() =>
            expect(
              within(within(modal).getByTestId("chart-container")).getByText(
                label,
              ),
            ).toBeInTheDocument(),
          );
        }

        expectColumnSelected(firstCard.name, "Count");
        expectColumnSelected(firstCard.name, firstDimension);
        expectColumnSelected(secondCard.name, "Count");
        expectColumnSelected(secondCard.name, secondDimension);
        expect(getLegendItemNames(modal)).toEqual([
          firstCard.name,
          secondCard.name,
        ]);

        // remove the second count column from the data sources
        const getColumn = (card: Card, column: string) =>
          getColumnListItem(getDataSourceItem(card.name), column);
        await userEvent.click(
          within(getColumn(secondCard, "Count")).getByLabelText("Remove"),
        );
        expectColumnSelected(secondCard.name, "Count", false);
        expect(getWellItems("vertical-well")).toEqual(["Count"]);
        // the legend is shown only for several series
        expect(
          within(modal).queryByLabelText("Legend"),
        ).not.toBeInTheDocument();

        // add it back
        await userEvent.click(getColumn(secondCard, "Count"));
        expectColumnSelected(secondCard.name, "Count");
        expect(getWellItems("vertical-well")).toEqual(["Count", secondCount]);
        expect(getLegendItemNames(modal)).toHaveLength(2);

        // remove both count columns from the well
        const removeFirstWellItem = (wellTestId: string) =>
          userEvent.click(
            within(
              within(screen.getByTestId(wellTestId)).getAllByTestId(
                "well-item",
              )[0],
            ).getByLabelText("Remove"),
          );
        await removeFirstWellItem("vertical-well");
        await removeFirstWellItem("vertical-well");
        expect(getWellItems("vertical-well")).toEqual([]);
        expectColumnSelected(firstCard.name, "Count", false);
        expectColumnSelected(secondCard.name, "Count", false);
        expect(
          within(modal).queryByLabelText("Legend"),
        ).not.toBeInTheDocument();

        // removing the dimension from the well removes it from both data sources
        await removeFirstWellItem("horizontal-well");
        expectColumnSelected(firstCard.name, firstDimension, false);
        expectColumnSelected(secondCard.name, secondDimension, false);
        expect(
          within(modal).queryByLabelText("Legend"),
        ).not.toBeInTheDocument();

        // add all columns back
        await userEvent.click(getColumn(firstCard, "Count"));
        await userEvent.click(getColumn(firstCard, firstDimension));
        await userEvent.click(getColumn(secondCard, "Count"));
        await userEvent.click(getColumn(secondCard, secondDimension));
        expect(getWellItems("vertical-well")).toEqual(["Count", secondCount]);
        expect(getWellItems("horizontal-well")).toEqual(dimensionWellItems);
        expect(getLegendItemNames(modal)).toHaveLength(2);

        // remove the second data source
        await userEvent.click(
          within(getDataSourceItem(secondCard.name)).getAllByLabelText(
            "Remove",
          )[0],
        );
        const dataImporter = within(modal).getByTestId(
          "visualizer-data-importer",
        );
        expect(
          within(dataImporter).queryByText(secondCard.name),
        ).not.toBeInTheDocument();
        expect(within(dataImporter).getAllByText("Count")).toHaveLength(1);
        expect(within(dataImporter).getAllByText(firstDimension)).toHaveLength(
          1,
        );
        // the dimension of the second data source is gone, unless both share it
        expect(
          within(dataImporter).queryAllByText(secondDimension),
        ).toHaveLength(secondDimension === firstDimension ? 1 : 0);
        expect(getWellItems("vertical-well")).toEqual(["Count"]);
        expect(getWellItems("horizontal-well")).toEqual([firstDimension]);
        expect(
          within(modal).queryByLabelText("Legend"),
        ).not.toBeInTheDocument();
      },
    );

    it("should show only the series that the card's viz settings enable", async () => {
      const dashcard = createMockDashboardCard({
        id: 51,
        dashboard_id: DASHBOARD_ID,
        card_id: ORDERS_BY_CREATED_AT_AND_CATEGORY_WITH_HIDDEN_SERIES.id,
        card: ORDERS_BY_CREATED_AT_AND_CATEGORY_WITH_HIDDEN_SERIES,
        size_x: 12,
        size_y: 8,
      });
      await setup({
        dashcards: [dashcard],
        cards: CARTESIAN_CARDS,
        datasets: CARTESIAN_DATASETS,
      });

      const enabledSeries = ["Doohickey", "Gizmo"];
      expect(
        getLegendItemNames(await findDashcardWithLegend(dashcard.id)),
      ).toEqual(enabledSeries);

      await editDashboard();
      const modal = await openVisualizer(dashcard.id, "Visualize another way");
      expect(getLegendItemNames(modal)).toEqual(enabledSeries);
      await userEvent.click(
        within(modal).getByRole("button", { name: "Settings" }),
      );
      expect(
        within(modal)
          .getAllByTestId("series-name-input")
          .map((input) => input.getAttribute("value")),
      ).toEqual(enabledSeries);
    });

    it("should keep the percent formatting of an added series (metabase#61521)", async () => {
      const dashcard = createMockDashboardCard({
        id: 52,
        dashboard_id: DASHBOARD_ID,
        card_id: TAX_OVER_SUBTOTAL.id,
        card: TAX_OVER_SUBTOTAL,
        size_x: 12,
        size_y: 8,
      });
      await setup({
        dashcards: [dashcard],
        cards: CARTESIAN_CARDS,
        datasets: CARTESIAN_DATASETS,
      });
      await editDashboard();

      const modal = await openVisualizer(dashcard.id, "Visualize another way");
      await addDataset(TAX_OVER_TOTAL.name);
      expect(getLegendItemNames(modal)).toEqual([
        TAX_OVER_SUBTOTAL.name,
        TAX_OVER_TOTAL.name,
      ]);

      const getChart = () => within(modal).getByTestId("chart-container");
      await waitFor(() =>
        expect(
          getPathsWithStroke(getChart(), HOVERED_SERIES_COLOR),
        ).not.toHaveLength(0),
      );
      await waitFor(() => expect(getYAxisLabels(getChart())).toContain("6%"));
      // a single percent axis: no axis with the unformatted ratios of the added series
      for (const label of getYAxisLabels(getChart())) {
        expect(label).toMatch(/^\d+(\.\d+)?%$/);
      }

      // hover the 6th point, as the e2e test did; the tooltip lists both series
      const tooltip = await showChartTooltip(getChart(), {
        seriesColor: HOVERED_SERIES_COLOR,
        dataIndex: 5,
      });
      const addedSeriesRow = checkNotNull(
        within(tooltip)
          .getAllByRole("row")
          .find((row) => within(row).queryByText(TAX_OVER_TOTAL.name) != null),
      );
      expect(within(addedSeriesRow).getByText("5.2%")).toBeInTheDocument();
    });
  });

  describe("analytics events", () => {
    // `metabase/analytics` is mocked for every test in the test setup
    const trackSimpleEvent = jest.mocked(Analytics.trackSimpleEvent);

    beforeEach(() => {
      trackSimpleEvent.mockClear();
    });

    const visualizerEvent = (
      event: string,
      eventDetail?: string,
    ): SimpleEventSchema => ({
      event,
      ...(eventDetail ? { event_detail: eventDetail } : {}),
      triggered_from: "visualizer-modal",
    });

    it("should track each visualizer action once, in order", async () => {
      const getVisualizerEvents = () =>
        trackSimpleEvent.mock.calls
          .map(([event]) => event)
          .filter(({ event }) => event.startsWith("visualize"));
      const expectedEvents: SimpleEventSchema[] = [];
      const expectNewEvent = async (event: SimpleEventSchema) => {
        expectedEvents.push(event);
        await waitFor(() =>
          expect(getVisualizerEvents()).toEqual(expectedEvents),
        );
      };

      await setup({ dashcards: [] });
      await editDashboard();

      let modal = await openVisualizerFromQuestionsSidebar(
        ORDERS_BY_CREATED_AT.name,
      );
      await expectNewEvent({
        event: "visualize_another_way_clicked",
        triggered_from: "question-list",
      });

      await userEvent.click(
        within(modal).getByRole("button", { name: "Add more data" }),
      );
      await expectNewEvent(visualizerEvent("visualizer_add_more_data_clicked"));

      await addDataset(PRODUCTS_BY_CREATED_AT.name);
      await expectNewEvent(
        visualizerEvent(
          "visualizer_data_changed",
          "visualizer_datasource_added",
        ),
      );

      // the datasets list refetches after a change, so query its items again
      const getProductsItem = () =>
        getItemWithText(
          within(within(modal).getByTestId("datasets-list")).getAllByTestId(
            "swap-dataset-button",
          ),
          PRODUCTS_BY_CREATED_AT.name,
        );
      await waitFor(() =>
        expect(getProductsItem()).toHaveAttribute("aria-pressed", "true"),
      );
      expect(getProductsItem()).toBeVisible();
      await userEvent.click(getProductsItem());
      await waitFor(() =>
        expect(getProductsItem()).toHaveAttribute("aria-pressed", "false"),
      );
      await expectNewEvent(
        visualizerEvent(
          "visualizer_data_changed",
          "visualizer_datasource_removed",
        ),
      );

      await userEvent.click(
        within(modal).getByRole("button", { name: "Done" }),
      );
      await expectNewEvent(visualizerEvent("visualizer_show_columns_clicked"));

      const ordersCount = () =>
        getColumnListItem(
          getDataSourceItem(ORDERS_BY_CREATED_AT.name),
          "Count",
        );
      await userEvent.click(within(ordersCount()).getByLabelText("Remove"));
      await expectNewEvent(
        visualizerEvent("visualizer_data_changed", "visualizer_column_removed"),
      );
      expect(getWellItems("vertical-well")).toEqual([]);

      await userEvent.click(ordersCount());
      await expectNewEvent(
        visualizerEvent("visualizer_data_changed", "visualizer_column_added"),
      );
      expect(getWellItems("vertical-well")).toEqual(["Count"]);

      await userEvent.click(
        within(modal).getByTestId("visualizer-settings-button"),
      );
      await expectNewEvent(visualizerEvent("visualizer_settings_clicked"));

      await userEvent.click(
        within(within(modal).getByTestId("viz-picker-main")).getByTestId(
          "area",
        ),
      );
      await expectNewEvent(
        visualizerEvent(
          "visualizer_data_changed",
          "visualizer_viz_type_changed",
        ),
      );

      await saveVisualizer("Add to dashboard");
      await expectNewEvent(visualizerEvent("visualizer_save_clicked"));

      const newDashcard = await findDashcardByTitle(ORDERS_BY_CREATED_AT.name);
      await userEvent.click(
        await within(newDashcard).findByLabelText("Edit visualization"),
      );
      modal = await findVisualizerModal();

      await userEvent.click(
        within(modal).getByTestId("visualizer-view-as-table-button"),
      );
      await expectNewEvent(visualizerEvent("visualizer_view_as_table_clicked"));
      await userEvent.click(
        within(
          await screen.findByTestId("visualizer-tabular-preview-modal"),
        ).getByLabelText("Close"),
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId("visualizer-tabular-preview-modal"),
        ).not.toBeInTheDocument(),
      );

      await userEvent.click(
        within(within(modal).getByTestId("viz-picker-main")).getByTestId("bar"),
      );
      await expectNewEvent(
        visualizerEvent(
          "visualizer_data_changed",
          "visualizer_viz_type_changed",
        ),
      );

      const openDataSourceActions = async () => {
        await userEvent.click(
          within(getDataSourceItem(ORDERS_BY_CREATED_AT.name)).getByLabelText(
            "Datasource actions",
          ),
        );
        return screen.findByTestId("datasource-actions-dropdown");
      };

      await userEvent.click(
        within(await openDataSourceActions()).getByLabelText(
          "Reset data source",
        ),
      );
      await expectNewEvent(
        visualizerEvent(
          "visualizer_data_changed",
          "visualizer_datasource_reset",
        ),
      );
      await waitFor(() =>
        expect(
          within(
            within(modal).getByTestId("viz-picker-main"),
          ).getByDisplayValue("line"),
        ).toBeChecked(),
      );

      await userEvent.click(
        within(await openDataSourceActions()).getByLabelText(
          "Remove data source",
        ),
      );
      await expectNewEvent(
        visualizerEvent(
          "visualizer_data_changed",
          "visualizer_datasource_removed",
        ),
      );
      await waitFor(() =>
        expect(
          within(
            screen.getByTestId("visualizer-data-importer"),
          ).queryAllByTestId("data-source-list-item"),
        ).toHaveLength(0),
      );

      await userEvent.click(
        within(modal).getByTestId("visualizer-close-button"),
      );
      await expectNewEvent(visualizerEvent("visualizer_close_clicked"));
    });
  });
});
