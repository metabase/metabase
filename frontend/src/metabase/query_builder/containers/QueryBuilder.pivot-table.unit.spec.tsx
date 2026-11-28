import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";
import _ from "underscore";

import { type PivotOptions, createMockPivotData } from "__support__/pivot";
import {
  setupAdhocPivotQueryEndpoint,
  setupCardPivotQueryEndpoint,
  setupLastDownloadFormatEndpoints,
} from "__support__/server-mocks";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { serializeCardForUrl } from "metabase/common/utils/card";
import type { State } from "metabase/redux/store";
import { resetRouterForTests } from "metabase/router/navigator";
import { b64hash_to_utf8 } from "metabase/utils/encoding";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { PIVOT_TABLE_BODY_LABEL } from "metabase/visualizations/visualizations/PivotTable/constants";
import { loadVisualizationComponents } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  Dataset,
  DatasetColumn,
  DatasetQuery,
  RowValues,
  TestStageWithSourceSpec,
  UnsavedCard,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
} from "metabase-types/api/mocks/presets";

import { getIsRunning } from "../store/selectors";

import { setup } from "./test-utils";

registerVisualizations();

beforeAll(() => loadVisualizationComponents(["pivot", "table", "bar"]));

type Store = { getState: () => State };

/** A query, the columns of its result, and its detail rows */
type PivotFixture = {
  stage: TestStageWithSourceSpec;
  breakouts: DatasetColumn[];
  aggregations: DatasetColumn[];
  rows: RowValues[];
};

type SubmittedStage = {
  "source-table"?: number;
  aggregation?: unknown[];
  breakout?: unknown[];
  "order-by"?: unknown[];
};

type SubmittedQuery = PivotOptions & { stages: SubmittedStage[] };

function parseBody(call: CallLog): SubmittedQuery {
  return JSON.parse(String(call.options.body));
}

/** The field id, or the name, that each clause of a submitted list refers to */
function getClauseTargets(clauses: unknown[] = []): unknown[] {
  return clauses.map((clause) =>
    Array.isArray(clause) ? clause[2] : undefined,
  );
}

function getFixtureQuery(fixture: PivotFixture): DatasetQuery {
  return Lib.createTestJsQuery(SAMPLE_PROVIDER, { stages: [fixture.stage] });
}

function getFixtureBreakoutTargets(fixture: PivotFixture): unknown[] {
  const query: SubmittedQuery = JSON.parse(
    JSON.stringify(getFixtureQuery(fixture)),
  );
  return getClauseTargets(query.stages[0].breakout);
}

function isFixtureQuery(fixture: PivotFixture, { stages }: SubmittedQuery) {
  const [stage] = stages;
  return (
    stages.length === 1 &&
    fixture.stage.source.type === "table" &&
    stage["source-table"] === fixture.stage.source.id &&
    stage.aggregation?.length === fixture.aggregations.length &&
    JSON.stringify(getClauseTargets(stage.breakout)) ===
      JSON.stringify(getFixtureBreakoutTargets(fixture))
  );
}

function createDataset(cols: DatasetColumn[], rows: RowValues[]): Dataset {
  return createMockDataset({
    data: { cols, rows },
    row_count: rows.length,
  });
}

const EMPTY_DATASET = createDataset([], []);

function createPivotDataset(
  fixture: PivotFixture,
  options: PivotOptions,
  rows = fixture.rows,
) {
  const data = createMockPivotData({
    breakouts: fixture.breakouts,
    aggregations: fixture.aggregations,
    rows,
    ...options,
  });
  return createDataset(data.cols, data.rows);
}

/**
 * Pivot options the backend reads from the card's settings when the card is
 * run by id
 */
function getCardPivotOptions(
  fixture: PivotFixture,
  settings: VisualizationSettings,
): PivotOptions {
  const split = settings["pivot_table.column_split"];
  if (split == null) {
    return {};
  }
  const getIndexes = (names: unknown[] = []) =>
    names.map((name) =>
      fixture.breakouts.findIndex((column) => column.name === name),
    );
  return {
    pivot_rows: getIndexes(split.rows),
    pivot_cols: getIndexes(split.columns),
  };
}

type SetupPivotEndpointsOpts = {
  fixtures: PivotFixture[];
  card?: Card | UnsavedCard;
  /** Overrides the response of the saved card */
  cardResponse?: Promise<Dataset>;
  /** Detail rows for a query with an order-by clause */
  getOrderedRows?: (stage: SubmittedStage) => RowValues[] | undefined;
};

function parseCardQuery(card: Card): SubmittedQuery {
  return JSON.parse(JSON.stringify(card.dataset_query));
}

function setupPivotEndpoints({
  fixtures,
  card,
  cardResponse,
  getOrderedRows = () => undefined,
}: SetupPivotEndpointsOpts) {
  const findFixture = (query: SubmittedQuery) =>
    fixtures.find((fixture) => isFixtureQuery(fixture, query));

  setupAdhocPivotQueryEndpoint((call) => {
    const body = parseBody(call);
    const fixture = findFixture(body);
    const [stage] = body.stages;
    const rows =
      stage["order-by"] == null ? fixture?.rows : getOrderedRows(stage);
    return fixture != null && rows != null
      ? createPivotDataset(fixture, body, rows)
      : EMPTY_DATASET;
  });

  const savedCard = card != null && "id" in card ? card : undefined;
  // The backend runs the card as it is stored, so a save changes the result
  let storedCard = savedCard;
  if (savedCard != null) {
    setupCardPivotQueryEndpoint(savedCard, () => {
      if (cardResponse != null) {
        return cardResponse;
      }
      if (storedCard == null) {
        return EMPTY_DATASET;
      }
      const fixture = findFixture(parseCardQuery(storedCard));
      return fixture != null
        ? createPivotDataset(
            fixture,
            getCardPivotOptions(fixture, storedCard.visualization_settings),
          )
        : EMPTY_DATASET;
    });
  }

  /**
   * Overrides the card and regular query endpoints that the query builder
   * setup registers
   */
  function overrideSetupEndpoints() {
    if (savedCard != null) {
      fetchMock.modifyRoute(`card-${savedCard.id}-put`, {
        response: (call: CallLog) => {
          storedCard = {
            ...savedCard,
            ...JSON.parse(String(call.options.body)),
          };
          return storedCard;
        },
      });
    }
    fetchMock.modifyRoute("dataset-post", {
      response: (call: CallLog) => {
        const fixture = findFixture(parseBody(call));
        return fixture != null
          ? createDataset(
              [...fixture.breakouts, ...fixture.aggregations],
              fixture.rows,
            )
          : EMPTY_DATASET;
      },
    });
  }

  return { overrideSetupEndpoints };
}

type SetupOpts = {
  fixture: PivotFixture;
  /** Fixtures of queries that the test changes the question to */
  otherFixtures?: PivotFixture[];
  card?: Card;
  display?: Card["display"];
  displayIsLocked?: boolean;
  cardResponse?: Promise<Dataset>;
  settings?: VisualizationSettings;
  initialRoute?: string;
  getOrderedRows?: SetupPivotEndpointsOpts["getOrderedRows"];
};

async function setupPivotQuestion({
  fixture,
  otherFixtures = [],
  card,
  display = "pivot",
  displayIsLocked = true,
  settings = {},
  initialRoute,
  cardResponse,
  getOrderedRows,
}: SetupOpts) {
  const question =
    card ??
    createMockUnsavedCard({
      display,
      // Without it the query builder picks a display for the result
      displayIsLocked,
      dataset_query: getFixtureQuery(fixture),
      visualization_settings: settings,
    });
  const { overrideSetupEndpoints } = setupPivotEndpoints({
    fixtures: [fixture, ...otherFixtures],
    card: question,
    cardResponse,
    getOrderedRows,
  });
  const result = await setup({
    card: question,
    initialRoute:
      initialRoute ??
      ("id" in question
        ? undefined
        : `/question#${serializeCardForUrl(question, {
            includeDisplayIsLocked: true,
          })}`),
    waitForLoad: false,
  });
  overrideSetupEndpoints();
  return result;
}

function getPivotTable() {
  return screen.getByTestId("pivot-table");
}

function getInPivotTable(text: string | RegExp) {
  return within(getPivotTable()).getByText(text);
}

function queryInPivotTable(text: string | RegExp) {
  return within(getPivotTable()).queryByText(text);
}

/**
 * The pivot table renders a placeholder until it has measured its columns, and
 * the query builder runs the query again once the measured widths land in the
 * settings. This waits until no query runs and the text shows.
 */
async function waitForPivotTableText(store: Store, text: string | RegExp) {
  await waitFor(() => {
    expect(getIsRunning(store.getState())).toBe(false);
    expect(getInPivotTable(text)).toBeInTheDocument();
  });
}

function getPivotCalls() {
  return fetchMock.callHistory.calls("path:/api/dataset/pivot");
}

async function openVizSettings() {
  if (screen.queryByTestId("chartsettings-sidebar") == null) {
    await userEvent.click(screen.getByTestId("viz-settings-button"));
  }
  return screen.findByTestId("chartsettings-sidebar");
}

async function openColumnSettings(columnName: string) {
  const item = await screen.findByTestId(`draggable-item-${columnName}`);
  await userEvent.click(within(item).getByLabelText("ellipsis icon"));
}

const SOURCE_COLUMN = createMockColumn({
  id: PEOPLE.SOURCE,
  name: "SOURCE",
  display_name: "User → Source",
  base_type: "type/Text",
  effective_type: "type/Text",
  source: "breakout",
  field_ref: ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
  fingerprint: { global: { "distinct-count": 5 } },
});

const CATEGORY_COLUMN = createMockColumn({
  id: PRODUCTS.CATEGORY,
  name: "CATEGORY",
  display_name: "Product → Category",
  base_type: "type/Text",
  effective_type: "type/Text",
  source: "breakout",
  field_ref: [
    "field",
    PRODUCTS.CATEGORY,
    { "source-field": ORDERS.PRODUCT_ID },
  ],
  fingerprint: { global: { "distinct-count": 4 } },
});

const COUNT_COLUMN = createMockColumn({
  name: "count",
  display_name: "Count",
  base_type: "type/BigInteger",
  effective_type: "type/BigInteger",
  semantic_type: "type/Quantity",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

const COUNT_AGGREGATION = {
  type: "operator",
  operator: "count",
  args: [],
} as const;

const SOURCE_BREAKOUT = {
  type: "column",
  fieldId: PEOPLE.SOURCE,
  sourceFieldId: ORDERS.USER_ID,
} as const;

const CATEGORY_BREAKOUT = {
  type: "column",
  fieldId: PRODUCTS.CATEGORY,
  sourceFieldId: ORDERS.PRODUCT_ID,
} as const;

// Count of orders by user source and product category. The totals are:
// Affiliate 3,520, Facebook 3,708, Twitter 4,484, Doohickey 4,210,
// Gizmo 4,554 and 18,904 in all.
const SOURCE_CATEGORY: PivotFixture = {
  stage: {
    source: { type: "table", id: ORDERS_ID },
    aggregations: [COUNT_AGGREGATION],
    breakouts: [SOURCE_BREAKOUT, CATEGORY_BREAKOUT],
  },
  breakouts: [SOURCE_COLUMN, CATEGORY_COLUMN],
  aggregations: [COUNT_COLUMN],
  rows: [
    ["Affiliate", "Doohickey", 783],
    ["Affiliate", "Gadget", 899],
    ["Affiliate", "Gizmo", 876],
    ["Affiliate", "Widget", 962],
    ["Facebook", "Doohickey", 816],
    ["Facebook", "Gadget", 1003],
    ["Facebook", "Gizmo", 912],
    ["Facebook", "Widget", 977],
    ["Google", "Doohickey", 805],
    ["Google", "Gadget", 999],
    ["Google", "Gizmo", 875],
    ["Google", "Widget", 915],
    ["Organic", "Doohickey", 798],
    ["Organic", "Gadget", 1007],
    ["Organic", "Gizmo", 905],
    ["Organic", "Widget", 888],
    ["Twitter", "Doohickey", 1008],
    ["Twitter", "Gadget", 1301],
    ["Twitter", "Gizmo", 986],
    ["Twitter", "Widget", 1189],
  ],
};

const STATE_COLUMN = createMockColumn({
  id: PEOPLE.STATE,
  name: "STATE",
  display_name: "User → State",
  base_type: "type/Text",
  effective_type: "type/Text",
  source: "breakout",
  field_ref: ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
  fingerprint: { global: { "distinct-count": 49 } },
});

const STATE_BREAKOUT = {
  type: "column",
  fieldId: PEOPLE.STATE,
  sourceFieldId: ORDERS.USER_ID,
} as const;

// Only Gizmo has a single source with a single state
const CATEGORY_SOURCE_STATE: PivotFixture = {
  stage: {
    source: { type: "table", id: ORDERS_ID },
    aggregations: [COUNT_AGGREGATION],
    breakouts: [CATEGORY_BREAKOUT, SOURCE_BREAKOUT, STATE_BREAKOUT],
  },
  breakouts: [CATEGORY_COLUMN, SOURCE_COLUMN, STATE_COLUMN],
  aggregations: [COUNT_COLUMN],
  rows: [
    ["Doohickey", "Affiliate", "AK", 3],
    ["Doohickey", "Affiliate", "TX", 2],
    ["Doohickey", "Facebook", "AK", 4],
    ["Gadget", "Google", "NY", 5],
    ["Gadget", "Organic", "NY", 6],
    ["Gizmo", "Affiliate", "AK", 9],
    ["Widget", "Twitter", "CA", 7],
    ["Widget", "Twitter", "WA", 8],
  ],
};

const CREATED_AT_YEAR_COLUMN = createMockColumn({
  id: ORDERS.CREATED_AT,
  name: "CREATED_AT",
  display_name: "Created At: Year",
  base_type: "type/DateTime",
  effective_type: "type/DateTime",
  source: "breakout",
  unit: "year",
  field_ref: ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
});

const CREATED_AT_YEAR_BREAKOUT = {
  type: "column",
  fieldId: ORDERS.CREATED_AT,
  unit: "year",
} as const;

const CREATED_AT_YEAR: PivotFixture = {
  stage: {
    source: { type: "table", id: ORDERS_ID },
    aggregations: [COUNT_AGGREGATION],
    breakouts: [CREATED_AT_YEAR_BREAKOUT],
  },
  breakouts: [CREATED_AT_YEAR_COLUMN],
  aggregations: [COUNT_COLUMN],
  rows: [
    ["2024-01-01T00:00:00Z", 1234],
    ["2025-01-01T00:00:00Z", 5678],
  ],
};

const TOTAL_BINS_COLUMN = createMockColumn({
  id: ORDERS.TOTAL,
  name: "TOTAL",
  display_name: "Total: 100 bins",
  base_type: "type/Float",
  effective_type: "type/Float",
  source: "breakout",
  field_ref: [
    "field",
    ORDERS.TOTAL,
    { binning: { strategy: "num-bins", "num-bins": 100 } },
  ],
  binning_info: {
    binning_strategy: "num-bins",
    num_bins: 100,
    bin_width: 2,
    min_value: 8,
    max_value: 160,
  },
});

// Many bins, so a sort moves the bins at one end out of sight
const TOTAL_BINS: PivotFixture = {
  stage: {
    source: { type: "table", id: ORDERS_ID },
    aggregations: [COUNT_AGGREGATION],
    breakouts: [
      {
        type: "column",
        fieldId: ORDERS.TOTAL,
        binning: { strategy: "num-bins", numBins: 100 },
      },
    ],
  },
  breakouts: [TOTAL_BINS_COLUMN],
  aggregations: [COUNT_COLUMN],
  rows: Array.from({ length: 76 }, (_value, index) => [
    8 + index * 2,
    100 + index,
  ]),
};

const SUM_OF_SUBTOTAL_COLUMN = createMockColumn({
  name: "sum",
  display_name: "Sum of Subtotal",
  base_type: "type/Float",
  effective_type: "type/Float",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

// One year per state, so no state has subtotals
const YEAR_CATEGORY_STATE: PivotFixture = {
  stage: {
    source: { type: "table", id: ORDERS_ID },
    aggregations: [
      {
        type: "operator",
        operator: "sum",
        args: [{ type: "column", fieldId: ORDERS.SUBTOTAL }],
      },
    ],
    breakouts: [CREATED_AT_YEAR_BREAKOUT, CATEGORY_BREAKOUT, STATE_BREAKOUT],
    filters: [
      {
        type: "operator",
        operator: ">",
        args: [
          { type: "column", fieldId: ORDERS.CREATED_AT },
          { type: "literal", value: "2029-01-01" },
        ],
      },
    ],
  },
  breakouts: [CREATED_AT_YEAR_COLUMN, CATEGORY_COLUMN, STATE_COLUMN],
  aggregations: [SUM_OF_SUBTOTAL_COLUMN],
  rows: [
    ["2029-01-01T00:00:00Z", "Doohickey", "AK", 65.09],
    ["2029-01-01T00:00:00Z", "Gadget", "AK", 120.5],
    ["2030-01-01T00:00:00Z", "Doohickey", "TX", 30.5],
    ["2030-01-01T00:00:00Z", "Gadget", "TX", 10.25],
    ["2030-01-01T00:00:00Z", "Gizmo", "TX", 88.25],
    ["2030-01-01T00:00:00Z", "Widget", "TX", 99.75],
  ],
};

// The Gadget subtotal of 2024 is 1,352
const YEAR_CATEGORY_SOURCE: PivotFixture = {
  stage: {
    source: { type: "table", id: ORDERS_ID },
    aggregations: [COUNT_AGGREGATION],
    breakouts: [CREATED_AT_YEAR_BREAKOUT, CATEGORY_BREAKOUT, SOURCE_BREAKOUT],
  },
  breakouts: [CREATED_AT_YEAR_COLUMN, CATEGORY_COLUMN, SOURCE_COLUMN],
  aggregations: [COUNT_COLUMN],
  rows: [
    ["2024-01-01T00:00:00Z", "Doohickey", "Affiliate", 101],
    ["2024-01-01T00:00:00Z", "Doohickey", "Facebook", 102],
    ["2025-01-01T00:00:00Z", "Doohickey", "Affiliate", 103],
    ["2025-01-01T00:00:00Z", "Doohickey", "Facebook", 104],
    ["2024-01-01T00:00:00Z", "Gadget", "Affiliate", 215],
    ["2024-01-01T00:00:00Z", "Gadget", "Facebook", 1137],
    ["2025-01-01T00:00:00Z", "Gadget", "Affiliate", 301],
    ["2025-01-01T00:00:00Z", "Gadget", "Facebook", 302],
    ["2024-01-01T00:00:00Z", "Widget", "Affiliate", 401],
    ["2024-01-01T00:00:00Z", "Widget", "Facebook", 402],
    ["2025-01-01T00:00:00Z", "Widget", "Affiliate", 403],
    ["2025-01-01T00:00:00Z", "Widget", "Facebook", 294],
  ],
};

const createIdColumn = (id: number, name: string, displayName: string) =>
  createMockColumn({
    id,
    name,
    display_name: displayName,
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: "type/FK",
    source: "breakout",
    field_ref: ["field", id, null],
  });

const USER_ID_COLUMN = createIdColumn(ORDERS.USER_ID, "USER_ID", "User ID");
const PRODUCT_ID_COLUMN = createIdColumn(
  ORDERS.PRODUCT_ID,
  "PRODUCT_ID",
  "Product ID",
);

const createCreatedAtColumn = (unit: "month" | "day", displayName: string) =>
  createMockColumn({
    id: ORDERS.CREATED_AT,
    name: "CREATED_AT",
    display_name: displayName,
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    source: "breakout",
    unit,
    field_ref: ["field", ORDERS.CREATED_AT, { "temporal-unit": unit }],
  });

// User 1162 bought a single product, user 1001 bought two
const MONTH_USER_PRODUCT: PivotFixture = {
  stage: {
    source: { type: "table", id: ORDERS_ID },
    aggregations: [COUNT_AGGREGATION],
    breakouts: [
      { type: "column", fieldId: ORDERS.CREATED_AT, unit: "month" },
      { type: "column", fieldId: ORDERS.USER_ID },
      { type: "column", fieldId: ORDERS.PRODUCT_ID },
    ],
  },
  breakouts: [
    createCreatedAtColumn("month", "Created At: Month"),
    USER_ID_COLUMN,
    PRODUCT_ID_COLUMN,
  ],
  aggregations: [COUNT_COLUMN],
  rows: [
    ["2025-05-01T00:00:00Z", 1001, 71, 2],
    ["2025-05-01T00:00:00Z", 1001, 72, 3],
    ["2025-05-01T00:00:00Z", 1162, 34, 1],
  ],
};

const SUM_OF_DISCOUNT_COLUMN = createMockColumn({
  name: "sum",
  display_name: "Sum of Discount",
  base_type: "type/Float",
  effective_type: "type/Float",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

const COUNT_COLUMN_2 = createMockColumn({
  ...COUNT_COLUMN,
  field_ref: ["aggregation", 1],
});

// November 10 has a single product
const DAY_PRODUCT: PivotFixture = {
  stage: {
    source: { type: "table", id: ORDERS_ID },
    aggregations: [
      {
        type: "operator",
        operator: "sum",
        args: [{ type: "column", fieldId: ORDERS.DISCOUNT }],
      },
      COUNT_AGGREGATION,
    ],
    breakouts: [
      { type: "column", fieldId: ORDERS.CREATED_AT, unit: "day" },
      { type: "column", fieldId: ORDERS.PRODUCT_ID },
    ],
  },
  breakouts: [
    createCreatedAtColumn("day", "Created At: Day"),
    PRODUCT_ID_COLUMN,
  ],
  aggregations: [SUM_OF_DISCOUNT_COLUMN, COUNT_COLUMN_2],
  rows: [
    ["2025-11-09T00:00:00Z", 10, 1.5, 1],
    ["2025-11-09T00:00:00Z", 20, 2.5, 1],
    ["2025-11-10T00:00:00Z", 30, 3.5, 1],
    ["2025-11-11T00:00:00Z", 40, 4.5, 1],
    ["2025-11-11T00:00:00Z", 50, 5.5, 1],
  ],
};

const CATEGORY_EXPRESSION_COLUMN = createMockColumn({
  name: "test",
  display_name: "test",
  base_type: "type/Text",
  effective_type: "type/Text",
  source: "breakout",
  field_ref: ["expression", "test"],
});

const PRODUCT_RATING_BINNED_COLUMN = createMockColumn({
  id: PRODUCTS.RATING,
  name: "RATING",
  display_name: "Rating: Auto binned",
  base_type: "type/Float",
  effective_type: "type/Float",
  source: "breakout",
  field_ref: ["field", PRODUCTS.RATING, { binning: { strategy: "default" } }],
  binning_info: {
    binning_strategy: "num-bins",
    num_bins: 8,
    bin_width: 1,
    min_value: 0,
    max_value: 5,
  },
});

// Category totals 42, 53, 51 and 54, and 200 in all
const CATEGORY_EXPRESSION_RATING: PivotFixture = {
  stage: {
    source: { type: "table", id: PRODUCTS_ID },
    expressions: [
      { name: "test", value: { type: "column", fieldId: PRODUCTS.CATEGORY } },
    ],
    aggregations: [COUNT_AGGREGATION],
    breakouts: [
      { type: "column", name: "test" },
      {
        type: "column",
        fieldId: PRODUCTS.RATING,
        binning: { strategy: "default" },
      },
    ],
  },
  breakouts: [CATEGORY_EXPRESSION_COLUMN, PRODUCT_RATING_BINNED_COLUMN],
  aggregations: [COUNT_COLUMN],
  rows: [
    ["Doohickey", 3, 20],
    ["Doohickey", 4, 22],
    ["Gadget", 3, 25],
    ["Gadget", 4, 28],
    ["Gizmo", 3, 30],
    ["Gizmo", 4, 21],
    ["Widget", 3, 24],
    ["Widget", 4, 30],
  ],
};

const REVIEWS_RATING_COLUMN = createMockColumn({
  id: REVIEWS.RATING,
  name: "RATING",
  display_name: "Rating",
  base_type: "type/Integer",
  effective_type: "type/Integer",
  semantic_type: "type/Score",
  source: "breakout",
  field_ref: ["field", REVIEWS.RATING, null],
  fingerprint: { global: { "distinct-count": 5 } },
});

const REVIEWS_CREATED_AT_YEAR_COLUMN = createMockColumn({
  id: REVIEWS.CREATED_AT,
  name: "CREATED_AT",
  display_name: "Created At: Year",
  base_type: "type/DateTime",
  effective_type: "type/DateTime",
  source: "breakout",
  unit: "year",
  field_ref: ["field", REVIEWS.CREATED_AT, { "temporal-unit": "year" }],
  fingerprint: { global: { "distinct-count": 1076 } },
});

// The year totals are 149 for 2022, 100 for 2023 and 23 for 2024
const RATING_YEAR: PivotFixture = {
  stage: {
    source: { type: "table", id: REVIEWS_ID },
    aggregations: [COUNT_AGGREGATION],
    breakouts: [
      { type: "column", fieldId: REVIEWS.RATING },
      { type: "column", fieldId: REVIEWS.CREATED_AT, unit: "year" },
    ],
  },
  breakouts: [REVIEWS_RATING_COLUMN, REVIEWS_CREATED_AT_YEAR_COLUMN],
  aggregations: [COUNT_COLUMN],
  rows: [
    [1, "2022-01-01T00:00:00Z", 30],
    [1, "2023-01-01T00:00:00Z", 40],
    [1, "2024-01-01T00:00:00Z", 5],
    [2, "2022-01-01T00:00:00Z", 119],
    [2, "2023-01-01T00:00:00Z", 60],
    [2, "2024-01-01T00:00:00Z", 18],
  ],
};

const SUM_OF_TOTAL_COLUMN = createMockColumn({
  name: "sum_2",
  display_name: "Sum of Total",
  base_type: "type/Float",
  effective_type: "type/Float",
  source: "aggregation",
  field_ref: ["aggregation", 1],
});

const SOURCE_SUMS: PivotFixture = {
  stage: {
    source: { type: "table", id: ORDERS_ID },
    aggregations: [
      {
        type: "operator",
        operator: "sum",
        args: [{ type: "column", fieldId: ORDERS.SUBTOTAL }],
      },
      {
        type: "operator",
        operator: "sum",
        args: [{ type: "column", fieldId: ORDERS.TOTAL }],
      },
    ],
    breakouts: [SOURCE_BREAKOUT],
  },
  breakouts: [SOURCE_COLUMN],
  aggregations: [SUM_OF_SUBTOTAL_COLUMN, SUM_OF_TOTAL_COLUMN],
  rows: [
    ["Affiliate", 100.5, 110.5],
    ["Facebook", 200.5, 220.5],
    ["Google", 300.5, 330.5],
  ],
};

const TOTAL_COLUMN = createMockColumn({
  id: ORDERS.TOTAL,
  name: "TOTAL",
  display_name: "Total",
  base_type: "type/Float",
  effective_type: "type/Float",
  source: "breakout",
  field_ref: ["field", ORDERS.TOTAL, null],
});

const DISTINCT_ID_COLUMN = createMockColumn({
  name: "count",
  display_name: "Distinct values of ID",
  base_type: "type/BigInteger",
  effective_type: "type/BigInteger",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

const DISTINCT_ID_AGGREGATION = {
  type: "operator",
  operator: "distinct",
  args: [{ type: "column", fieldId: ORDERS.ID }],
} as const;

const TOTAL_DISTINCT: PivotFixture = {
  stage: {
    source: { type: "table", id: ORDERS_ID },
    aggregations: [DISTINCT_ID_AGGREGATION],
    breakouts: [{ type: "column", fieldId: ORDERS.TOTAL }],
  },
  breakouts: [TOTAL_COLUMN],
  aggregations: [DISTINCT_ID_COLUMN],
  rows: [
    [12.5, 3],
    [25.5, 4],
  ],
};

const TOTAL_CATEGORY_DISTINCT: PivotFixture = {
  stage: {
    ...TOTAL_DISTINCT.stage,
    breakouts: [{ type: "column", fieldId: ORDERS.TOTAL }, CATEGORY_BREAKOUT],
  },
  breakouts: [TOTAL_COLUMN, CATEGORY_COLUMN],
  aggregations: [DISTINCT_ID_COLUMN],
  rows: [
    [12.5, "Gadget", 1],
    [12.5, "Widget", 2],
    [25.5, "Gizmo", 4],
  ],
};

const SUM_OF_TOTAL_COLUMN_2 = createMockColumn({
  ...SUM_OF_TOTAL_COLUMN,
  name: "sum",
});

const YEAR_STATE: PivotFixture = {
  stage: {
    source: { type: "table", id: ORDERS_ID },
    aggregations: [
      COUNT_AGGREGATION,
      {
        type: "operator",
        operator: "sum",
        args: [{ type: "column", fieldId: ORDERS.TOTAL }],
      },
    ],
    breakouts: [STATE_BREAKOUT, CREATED_AT_YEAR_BREAKOUT],
  },
  breakouts: [STATE_COLUMN, CREATED_AT_YEAR_COLUMN],
  aggregations: [COUNT_COLUMN, SUM_OF_TOTAL_COLUMN_2],
  rows: [
    ["AK", "2024-01-01T00:00:00Z", 2, 20.5],
    ["TX", "2025-01-01T00:00:00Z", 3, 30.5],
  ],
};

const YEAR_STATE_CATEGORY: PivotFixture = {
  stage: {
    ...YEAR_STATE.stage,
    breakouts: [STATE_BREAKOUT, CREATED_AT_YEAR_BREAKOUT, CATEGORY_BREAKOUT],
  },
  breakouts: [STATE_COLUMN, CREATED_AT_YEAR_COLUMN, CATEGORY_COLUMN],
  aggregations: [COUNT_COLUMN, SUM_OF_TOTAL_COLUMN_2],
  rows: [
    ["AK", "2024-01-01T00:00:00Z", "Gadget", 2, 20.5],
    ["TX", "2025-01-01T00:00:00Z", "Widget", 3, 30.5],
  ],
};

describe("QueryBuilder > pivot table", () => {
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("runs a regular query without subtotals after a switch to the table visualization", async () => {
    const card = createMockCard({
      id: 1,
      name: "Cypress Pivot Table",
      display: "pivot",
      dataset_query: getFixtureQuery(SOURCE_CATEGORY),
    });
    const { store } = await setupPivotQuestion({
      fixture: SOURCE_CATEGORY,
      card,
    });

    await waitForPivotTableText(store, "3,520");
    expect(getInPivotTable("User → Source")).toBeInTheDocument();
    expect(getInPivotTable("Row totals")).toBeInTheDocument();
    expect(getInPivotTable("Grand totals")).toBeInTheDocument();
    expect(getInPivotTable("4,554")).toBeInTheDocument();
    expect(getInPivotTable("18,904")).toBeInTheDocument();
    const pivotCallCount = getPivotCalls().length;

    await userEvent.click(screen.getByText("Visualization"));
    await userEvent.click(await screen.findByTestId("Table-button"));

    await waitFor(() =>
      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(1),
    );
    const [tableCall] = fetchMock.callHistory.calls("path:/api/dataset");
    expect(isFixtureQuery(SOURCE_CATEGORY, parseBody(tableCall))).toBe(true);
    expect(getPivotCalls()).toHaveLength(pivotCallCount);

    expect(await screen.findByTestId("table-root")).toBeInTheDocument();
    // A changed saved question shows the title of an ad-hoc one
    expect(
      within(screen.getByTestId("qb-header")).getByText(
        "Count by User → Source and Product → Category",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("pivot-table")).not.toBeInTheDocument();
    const root = screen.getByTestId("query-visualization-root");
    expect(within(root).getByText(/User → Source/)).toBeInTheDocument();
    expect(within(root).getByText("783")).toBeInTheDocument();
    expect(within(root).getByText("986")).toBeInTheDocument();
    expect(within(root).queryByText(/Row totals/i)).not.toBeInTheDocument();
    expect(within(root).queryByText(/Grand totals/i)).not.toBeInTheDocument();
    expect(within(root).queryByText("3,520")).not.toBeInTheDocument();
    expect(within(root).queryByText("4,554")).not.toBeInTheDocument();
    expect(within(root).queryByText("18,904")).not.toBeInTheDocument();
  });

  it("hides the subtotals of a row column, and expands its collapsed values when it does", async () => {
    const { store } = await setupPivotQuestion({
      fixture: SOURCE_CATEGORY,
      settings: {
        "pivot_table.column_split": {
          rows: ["SOURCE", "CATEGORY"],
          columns: [],
          values: [],
        },
      },
    });
    await waitForPivotTableText(store, "Totals for Facebook");
    expect(getInPivotTable("3,520")).toBeInTheDocument();
    expect(getInPivotTable("3,708")).toBeInTheDocument();

    await openVizSettings();

    // The last row column has no subtotals to hide
    await openColumnSettings("Product → Category");
    expect(await screen.findByText("Column title")).toBeInTheDocument();
    expect(screen.queryByText("Show totals")).not.toBeInTheDocument();

    await openVizSettings();
    await openColumnSettings("User → Source");
    const showTotals = await screen.findByTestId(
      "chart-settings-widget-pivot_table.column_show_totals",
    );
    expect(within(showTotals).getByText("Show totals")).toBeVisible();
    await userEvent.click(within(showTotals).getByRole("switch"));
    await waitFor(() =>
      expect(queryInPivotTable("3,708")).not.toBeInTheDocument(),
    );
    expect(queryInPivotTable("3,520")).not.toBeInTheDocument();
    expect(queryInPivotTable("Totals for Facebook")).not.toBeInTheDocument();

    await userEvent.click(within(showTotals).getByRole("switch"));
    await waitForPivotTableText(store, "3,708");
    expect(getInPivotTable("3,520")).toBeInTheDocument();
    expect(getInPivotTable("1,003")).toBeInTheDocument();

    await userEvent.click(
      within(getPivotTable()).getByTestId("Facebook-toggle-button"),
    );
    await waitFor(() =>
      expect(queryInPivotTable("1,003")).not.toBeInTheDocument(),
    );
    expect(getInPivotTable("3,708")).toBeInTheDocument();
    // Another source stays expanded
    expect(getInPivotTable("899")).toBeInTheDocument();

    await openVizSettings();
    await openColumnSettings("User → Source");
    await userEvent.click(
      within(
        await screen.findByTestId(
          "chart-settings-widget-pivot_table.column_show_totals",
        ),
      ).getByRole("switch"),
    );
    await waitFor(() =>
      expect(queryInPivotTable("3,708")).not.toBeInTheDocument(),
    );
    expect(getInPivotTable("1,003")).toBeInTheDocument();
  });

  it("shows the subtotals of a group with a single value once duplicate totals are no longer condensed (metabase#52333)", async () => {
    const { store } = await setupPivotQuestion({
      fixture: CATEGORY_SOURCE_STATE,
      settings: {
        "pivot_table.column_split": {
          rows: ["CATEGORY", "SOURCE", "STATE"],
          columns: [],
          values: ["count", "avg"],
        },
        "pivot_table.column_widths": {
          leftHeaderWidths: [104, 92, 80],
          totalLeftHeaderWidths: 276,
          valueHeaderWidths: {},
        },
        "pivot_table.collapsed_rows": {
          value: ['["Doohickey"]', '["Gadget"]', '["Widget"]'],
          rows: ["CATEGORY", "SOURCE", "STATE"],
        },
      },
    });

    await waitForPivotTableText(store, "Gizmo");
    expect(getInPivotTable("Affiliate")).toBeInTheDocument();
    expect(getInPivotTable("AK")).toBeInTheDocument();
    expect(getInPivotTable("Totals for Doohickey")).toBeInTheDocument();
    expect(queryInPivotTable("Totals for Affiliate")).not.toBeInTheDocument();

    const sidebar = await openVizSettings();
    await userEvent.click(
      within(sidebar).getByText("Condense duplicate totals"),
    );

    await waitFor(() =>
      expect(getInPivotTable("Totals for Affiliate")).toBeInTheDocument(),
    );
  });

  it("formats the values and renames a row column from the column settings", async () => {
    const { store } = await setupPivotQuestion({ fixture: SOURCE_CATEGORY });
    await waitForPivotTableText(store, "3,520");
    expect(
      within(screen.getByTestId("qb-header")).getByText(
        "Count by User → Source and Product → Category",
      ),
    ).toBeInTheDocument();
    expect(getInPivotTable("User → Source")).toBeInTheDocument();
    expect(getInPivotTable(/Row totals/i)).toBeInTheDocument();
    expect(getInPivotTable(/Grand totals/i)).toBeInTheDocument();
    expect(getInPivotTable("4,554")).toBeInTheDocument();
    expect(getInPivotTable("18,904")).toBeInTheDocument();

    const sidebar = await openVizSettings();
    expect(
      within(sidebar)
        .getAllByTestId("pivot-table-setting")
        .map((label) => label.textContent),
    ).toEqual(["Rows", "Columns", "Measures"]);
    expect(
      within(sidebar)
        .getAllByTestId(/^draggable-item-/)
        .map((item) => item.dataset.testid),
    ).toEqual([
      "draggable-item-User → Source",
      "draggable-item-Product → Category",
      "draggable-item-Count",
    ]);

    await openColumnSettings("Count");
    expect(await screen.findByText("Column title")).toBeInTheDocument();
    expect(screen.getByText("Format")).toBeInTheDocument();
    expect(screen.getByText("Separator style")).toBeInTheDocument();
    // Value fields cannot be sorted
    expect(screen.queryByText("Sort order")).not.toBeInTheDocument();
    await userEvent.click(
      within(
        screen.getByTestId("chart-settings-widget-number_style"),
      ).getByText("123%"),
    );
    await waitFor(() => expect(getInPivotTable("89,900%")).toBeInTheDocument());
    expect(getInPivotTable("78,300%")).toBeInTheDocument();
    expect(queryInPivotTable("899")).not.toBeInTheDocument();

    await openColumnSettings("User → Source");
    const title = await screen.findByDisplayValue("User → Source");
    await userEvent.clear(title);
    await userEvent.type(title, "ModifiedTITLE");
    await userEvent.tab();
    await waitFor(() =>
      expect(getInPivotTable("ModifiedTITLE")).toBeInTheDocument(),
    );
    expect(queryInPivotTable("User → Source")).not.toBeInTheDocument();
  });

  it("renames the column of the values (metabase#15353)", async () => {
    const card = createMockCard({
      id: 1,
      name: "15353",
      display: "pivot",
      dataset_query: getFixtureQuery(CREATED_AT_YEAR),
    });
    const { store } = await setupPivotQuestion({
      fixture: CREATED_AT_YEAR,
      card,
    });
    await waitForPivotTableText(store, "Count");

    await openVizSettings();
    await openColumnSettings("Count");
    const title = await screen.findByDisplayValue("Count");
    await userEvent.type(title, " renamed");
    await userEvent.tab();

    await waitFor(() =>
      expect(getInPivotTable("Count renamed")).toBeInTheDocument(),
    );
    expect(getInPivotTable("1,234")).toBeInTheDocument();
  });

  it("sorts the values of a row column in both directions", async () => {
    const { store, router } = await setupPivotQuestion({
      fixture: TOTAL_BINS,
    });
    await waitForPivotTableText(store, "8 – 10");

    await sortColumn("Total: 100 bins", "descending");
    await waitFor(() =>
      expect(getInPivotTable("158 – 160")).toBeInTheDocument(),
    );
    expect(queryInPivotTable("8 – 10")).not.toBeInTheDocument();
    expect(b64hash_to_utf8(router.location.hash)).toContain(
      '"pivot_table.column_sort_order":"descending"',
    );

    await sortColumn("Total: 100 bins", "ascending");
    await waitFor(() => expect(getInPivotTable("8 – 10")).toBeInTheDocument());
    expect(queryInPivotTable("158 – 160")).not.toBeInTheDocument();
    expect(b64hash_to_utf8(router.location.hash)).toContain(
      '"pivot_table.column_sort_order":"ascending"',
    );
  });

  it("shows no subtotals for a row column with a single value per group, and applies conditional formatting", async () => {
    const { store } = await setupPivotQuestion({
      fixture: YEAR_CATEGORY_STATE,
      settings: {
        "pivot_table.column_split": {
          rows: ["STATE", "CREATED_AT"],
          columns: ["CATEGORY"],
          values: ["sum"],
        },
        "pivot_table.collapsed_rows": {
          value: [],
          rows: ["STATE", "CREATED_AT"],
        },
      },
    });
    await waitForPivotTableText(store, "65.09");
    expect(queryInPivotTable(/Totals for/)).not.toBeInTheDocument();

    const sidebar = await openVizSettings();
    await userEvent.click(
      within(sidebar).getByRole("tab", { name: "Conditional Formatting" }),
    );
    await userEvent.click(within(sidebar).getByText("Add a rule"));
    const valueInput = await screen.findByTestId(
      "conditional-formatting-value-input",
    );
    await userEvent.type(valueInput, "70");
    await userEvent.tab();
    await userEvent.click(screen.getByDisplayValue("is equal to"));
    await userEvent.click(
      await screen.findByRole("option", { name: "is less than or equal to" }),
    );

    await waitFor(() =>
      expect(getPivotCell("65.09")).toHaveStyle({
        "background-color": "rgba(80, 158, 227, 0.65)",
      }),
    );
    expect(getPivotCell("120.5")).not.toHaveStyle({
      "background-color": "rgba(80, 158, 227, 0.65)",
    });
  });
  it("collapses and expands the rows of a value and of a whole column", async () => {
    const { store } = await setupPivotQuestion({
      fixture: YEAR_CATEGORY_SOURCE,
      settings: {
        "pivot_table.column_split": {
          rows: ["CATEGORY", "SOURCE"],
          columns: ["CREATED_AT"],
          values: ["count"],
        },
      },
    });
    await waitForPivotTableText(store, "215");
    expect(getInPivotTable("294")).toBeInTheDocument();

    await userEvent.click(
      within(getPivotCell("Gadget")).getByLabelText("dash icon"),
    );
    await waitFor(() =>
      expect(queryInPivotTable("215")).not.toBeInTheDocument(),
    );
    expect(getInPivotTable("1,352")).toBeInTheDocument();
    // Another category stays expanded
    expect(getInPivotTable("294")).toBeInTheDocument();

    await userEvent.click(
      within(getPivotCell("Totals for Gadget")).getByLabelText("add icon"),
    );
    await waitFor(() => expect(getInPivotTable("215")).toBeInTheDocument());

    const categoryHeader = getPivotCell("Product → Category");
    await userEvent.click(within(categoryHeader).getByLabelText("dash icon"));
    await waitFor(() =>
      expect(queryInPivotTable("215")).not.toBeInTheDocument(),
    );
    expect(queryInPivotTable("294")).not.toBeInTheDocument();
    expect(getInPivotTable("Totals for Widget")).toBeInTheDocument();

    await userEvent.click(
      within(getPivotCell("Totals for Gadget")).getByLabelText("add icon"),
    );
    await waitFor(() => expect(getInPivotTable("215")).toBeInTheDocument());
    expect(queryInPivotTable("294")).not.toBeInTheDocument();
  });

  it("shows standalone values when collapsed to the sub-level grouping (metabase#25250)", async () => {
    const { store } = await setupPivotQuestion({
      fixture: MONTH_USER_PRODUCT,
      settings: {
        "pivot_table.column_split": {
          rows: ["CREATED_AT", "USER_ID", "PRODUCT_ID"],
          columns: [],
          values: ["count"],
        },
        "pivot_table.collapsed_rows": {
          value: [],
          rows: ["CREATED_AT", "USER_ID", "PRODUCT_ID"],
        },
      },
    });
    await waitForPivotTableText(store, "1162");
    expect(getInPivotTable("71")).toBeInTheDocument();

    await userEvent.click(
      within(getPivotCell("User ID")).getByLabelText("dash icon"),
    );
    await waitFor(() =>
      expect(getInPivotTable("Totals for 1162")).toBeVisible(),
    );
    expect(getInPivotTable("Totals for 1001")).toBeInTheDocument();
    expect(queryInPivotTable("71")).not.toBeInTheDocument();

    await userEvent.click(
      within(getPivotCell("Totals for 1162")).getByLabelText("add icon"),
    );
    await waitFor(() => expect(getInPivotTable("1162")).toBeVisible());
    expect(getInPivotTable("34")).toBeVisible();
    // The other user stays collapsed
    expect(getInPivotTable("Totals for 1001")).toBeInTheDocument();
    expect(queryInPivotTable("71")).not.toBeInTheDocument();
  });

  it("shows the totals of every value when collapsed to the top-level grouping (metabase#15211)", async () => {
    const { store } = await setupPivotQuestion({
      fixture: DAY_PRODUCT,
      settings: {
        "pivot_table.column_split": {
          rows: ["CREATED_AT", "PRODUCT_ID"],
          columns: [],
          values: ["sum", "count"],
        },
        "pivot_table.collapsed_rows": {
          value: [],
          rows: ["CREATED_AT", "PRODUCT_ID"],
        },
      },
    });
    await waitForPivotTableText(store, "November 10, 2025");
    expect(getInPivotTable("November 9, 2025")).toBeInTheDocument();
    expect(getInPivotTable("November 11, 2025")).toBeInTheDocument();
    expect(
      queryInPivotTable("Totals for November 10, 2025"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(getPivotCell("Created At: Day")).getByLabelText("dash icon"),
    );

    await waitFor(() =>
      expect(
        getInPivotTable("Totals for November 10, 2025"),
      ).toBeInTheDocument(),
    );
    expect(getInPivotTable("Totals for November 9, 2025")).toBeInTheDocument();
    expect(getInPivotTable("Totals for November 11, 2025")).toBeInTheDocument();
  });

  it("shows the totals of collapsed rows (metabase#26919)", async () => {
    const card = createMockCard({
      id: 1,
      display: "pivot",
      dataset_query: getFixtureQuery(CATEGORY_EXPRESSION_RATING),
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["test", "RATING"],
          columns: [],
          values: ["count"],
        },
        "pivot_table.collapsed_rows": {
          value: ['["Doohickey"]', '["Gadget"]', '["Gizmo"]', '["Widget"]'],
          rows: ["test", "RATING"],
        },
      },
    });
    const { store } = await setupPivotQuestion({
      fixture: CATEGORY_EXPRESSION_RATING,
      card,
    });
    await waitForPivotTableText(store, "Totals for Gadget");

    expect(getBodyCellTexts()).toEqual(["42", "53", "51", "54", "200"]);
  });

  it("keeps the order of the rows sorted by a metric (metabase#22872)", async () => {
    const { store } = await setupPivotQuestion({
      fixture: RATING_YEAR,
      getOrderedRows: (stage) =>
        isOrderedByFirstAggregation(stage)
          ? _.sortBy(RATING_YEAR.rows, (row) => Number(row[2]))
          : undefined,
    });
    await waitForPivotTableText(store, "Created At: Year");
    expect(getInPivotTable("Row totals")).toBeInTheDocument();
    expect(getFirstRowTotal()).toBe("149");

    await userEvent.click(screen.getByTestId("notebook-button"));
    const summarizeStep = await screen.findByTestId("step-summarize-0-0");
    await userEvent.click(
      within(summarizeStep).getByRole("button", { name: "Sort" }),
    );
    const popover = await screen.findByTestId("clause-popover");
    await userEvent.click(await within(popover).findByText("Count"));
    await userEvent.click(screen.getByRole("button", { name: "Visualize" }));

    await waitFor(() => expect(getFirstRowTotal()).toBe("23"));
    expect(isOrderedByFirstAggregation(getLastPivotBody().stages[0])).toBe(
      true,
    );
  });

  it("switches between the notebook and the simple view with a pivot table (metabase#39504)", async () => {
    const { store } = await setupPivotQuestion({
      fixture: SOURCE_SUMS,
      display: "table",
      displayIsLocked: false,
    });
    const vizTypeButton = await screen.findByTestId("viz-type-button");
    await waitFor(() =>
      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(1),
    );
    await waitFor(() => expect(getIsRunning(store.getState())).toBe(false));
    expect(getPivotCalls()).toHaveLength(0);

    await userEvent.click(vizTypeButton);
    await userEvent.click(await screen.findByTestId("Pivot Table-button"));
    await waitFor(() => expect(getPivotCalls()).toHaveLength(1));
    expect(isFixtureQuery(SOURCE_SUMS, getLastPivotBody())).toBe(true);
    await waitForPivotTableText(store, "Grand totals");
    assertSourceSumsPivotTable();

    await userEvent.click(screen.getByTestId("notebook-button"));
    const summarizeStep = await screen.findByTestId("step-summarize-0-0");
    expect(within(summarizeStep).getByText("Sum of Subtotal")).toBeVisible();
    expect(within(summarizeStep).getByText("Sum of Total")).toBeVisible();

    await userEvent.click(screen.getByTestId("notebook-button"));
    // jsdom runs no CSS transitions, so the notebook gets the end of its fade
    // out from the test
    // eslint-disable-next-line testing-library/no-node-access -- the notebook container has no role or test id
    const notebook = summarizeStep.closest<HTMLElement>(
      "[style*='translateY']",
    );
    await waitFor(() => expect(notebook).toHaveStyle({ opacity: "0" }));
    // jsdom has no TransitionEvent, so the event gets its property by hand
    const transitionEnd = Object.assign(
      new Event("transitionend", { bubbles: true }),
      { propertyName: "opacity" },
    );
    fireEvent(checkNotNull(notebook), transitionEnd);
    await waitFor(() =>
      expect(
        screen.queryByTestId("step-summarize-0-0"),
      ).not.toBeInTheDocument(),
    );
    await waitForPivotTableText(store, "Grand totals");
    assertSourceSumsPivotTable();
  });

  it("changes a grouping in the notebook while the query still runs (metabase#26467)", async () => {
    const card = createMockCard({
      id: 1,
      display: "pivot",
      dataset_query: getFixtureQuery(SOURCE_CATEGORY),
    });
    const response = defer<Dataset>();
    const { store } = await setupPivotQuestion({
      fixture: SOURCE_CATEGORY,
      card,
      cardResponse: response.promise,
    });
    expect(
      await within(await screen.findByTestId("query-builder-main")).findByText(
        "Doing science...",
      ),
    ).toBeVisible();

    await userEvent.click(screen.getByTestId("notebook-button"));
    const summarizeStep = await screen.findByTestId("step-summarize-0-0");
    await userEvent.click(within(summarizeStep).getByText("User → Source"));
    const popover = await screen.findByTestId("clause-popover");
    await userEvent.click(await within(popover).findByText("Address"));

    expect(
      await within(summarizeStep).findByText("User → Address"),
    ).toBeVisible();
    expect(
      within(summarizeStep).queryByText("User → Source"),
    ).not.toBeInTheDocument();

    response.resolve(createPivotDataset(SOURCE_CATEGORY, {}));
    await waitFor(() => expect(getIsRunning(store.getState())).toBe(false));
  });

  it("shows a breakout that is added to a question with custom column widths, also after a reload (metabase#37726)", async () => {
    const card = createMockCard({
      id: 1,
      name: "Pivot table with custom column width",
      display: "pivot",
      dataset_query: getFixtureQuery(TOTAL_DISTINCT),
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["TOTAL"],
          columns: [],
          values: ["distinct"],
        },
        "pivot_table.column_widths": {
          leftHeaderWidths: [80],
          totalLeftHeaderWidths: 80,
          valueHeaderWidths: { 0: 193 },
        },
      },
    });
    const { store, router } = await setupPivotQuestion({
      fixture: TOTAL_DISTINCT,
      otherFixtures: [TOTAL_CATEGORY_DISTINCT],
      card,
    });
    await waitForPivotTableText(store, "Distinct values of ID");

    await userEvent.click(screen.getByRole("button", { name: /Summarize/ }));
    const rowsWell = await screen.findByTestId("summary-well-rows");
    await userEvent.type(
      within(rowsWell).getByLabelText("Add a row by name"),
      "Category",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Category/ }),
    );

    await waitFor(() =>
      expect(isFixtureQuery(TOTAL_CATEGORY_DISTINCT, getLastPivotBody())).toBe(
        true,
      ),
    );
    await waitForPivotTableText(store, "Product → Category");

    // A reload opens the changed question from the URL
    const url = `${router.location.pathname}${router.location.hash}`;
    expect(router.location.hash).not.toBe("");
    await resetPage();
    const reloaded = await setupPivotQuestion({
      fixture: TOTAL_CATEGORY_DISTINCT,
      card,
      initialRoute: url,
    });
    await waitForPivotTableText(reloaded.store, "Product → Category");
    expect(getInPivotTable("Gizmo")).toBeInTheDocument();
  });

  it("shows a breakout that is added in the notebook to a question with custom column widths and saved (metabase#42697)", async () => {
    const card = createMockCard({
      id: 1,
      name: "42697",
      display: "pivot",
      dataset_query: getFixtureQuery(YEAR_STATE),
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["CREATED_AT"],
          columns: ["STATE"],
          values: ["count", "sum"],
        },
        "pivot_table.column_widths": {
          leftHeaderWidths: [156],
          totalLeftHeaderWidths: 156,
          valueHeaderWidths: {},
        },
      },
    });
    const { store } = await setupPivotQuestion({
      fixture: YEAR_STATE,
      otherFixtures: [YEAR_STATE_CATEGORY],
      card,
    });
    await waitForPivotTableText(store, "AK");

    await userEvent.click(screen.getByTestId("notebook-button"));
    const summarizeStep = await screen.findByTestId("step-summarize-0-0");
    await userEvent.click(
      within(within(summarizeStep).getByTestId("breakout-step")).getByLabelText(
        "add icon",
      ),
    );
    const popover = await screen.findByTestId("clause-popover");
    await userEvent.click(await within(popover).findByText("Product"));
    await userEvent.click(await within(popover).findByText("Category"));
    expect(
      await within(summarizeStep).findByText("Product → Category"),
    ).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId("qb-header")).getByRole("button", {
        name: "Save",
      }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Save",
      }),
    );
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(`path:/api/card/${card.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1),
    );
    const [saveCall] = fetchMock.callHistory.calls(
      `path:/api/card/${card.id}`,
      { method: "PUT" },
    );
    const savedCard: Pick<Card, "dataset_query"> = JSON.parse(
      String(saveCall.options.body),
    );
    expect(
      isFixtureQuery(
        YEAR_STATE_CATEGORY,
        JSON.parse(JSON.stringify(savedCard.dataset_query)),
      ),
    ).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Visualize" }));
    await waitForPivotTableText(store, "Product → Category");
    expect(getInPivotTable("Widget")).toBeInTheDocument();
  });

  it("moves a column from the columns to the rows", async () => {
    const { store } = await setupPivotQuestion({ fixture: SOURCE_CATEGORY });
    await waitForPivotTableText(store, "Doohickey");
    const pivotCallCount = getPivotCalls().length;
    expect(getLastPivotBody()).toMatchObject({
      pivot_rows: [0],
      pivot_cols: [1],
    });
    expect(queryInPivotTable(/Totals for/)).not.toBeInTheDocument();

    const sidebar = await openVizSettings();
    await dragColumn({
      from: within(sidebar).getByTestId("draggable-item-Product → Category"),
      to: within(sidebar).getByTestId("draggable-item-User → Source"),
    });

    expect(await within(sidebar).findByText("Drag fields here")).toBeVisible();
    await waitFor(() =>
      expect(getPivotCalls().length).toBeGreaterThan(pivotCallCount),
    );
    expect(getLastPivotBody()).toMatchObject({
      pivot_rows: [1, 0],
      pivot_cols: [],
    });
    await waitForPivotTableText(store, "Totals for Gizmo");
    expect(getInPivotTable("Product → Category")).toBeInTheDocument();
    expect(getInPivotTable("User → Source")).toBeInTheDocument();
    expect(getInPivotTable("Count")).toBeInTheDocument();
    expect(getInPivotTable("4,554")).toBeInTheDocument();
  });
});

/**
 * jsdom has no layout. This lays out each element of `container` as a block
 * below the elements before it in document order, as tall as its subtree, so
 * that nested elements sit inside their parents and siblings stack downwards,
 * and a moved element takes its new place. The drag overlay, which a browser
 * shows on top of the page, starts at the rect of `overlayRectOf`.
 */
function mockDocumentOrderLayout(
  container: HTMLElement,
  overlayRectOf: HTMLElement,
) {
  const ROW_HEIGHT = 10;
  const getRectMock = jest.mocked(HTMLElement.prototype.getBoundingClientRect);
  const defaultGetRect = checkNotNull(getRectMock.getMockImplementation());
  const isInOverlay = (element: Element) =>
    // eslint-disable-next-line testing-library/no-node-access -- a layout of the DOM tree
    element.closest("[style*='position: fixed']") != null;
  const getRect = (element: Element) => {
    // eslint-disable-next-line testing-library/no-node-access -- a layout of the DOM tree
    const elements = Array.from(container.querySelectorAll("*")).filter(
      (element) => !isInOverlay(element),
    );
    // eslint-disable-next-line testing-library/no-node-access -- a layout of the DOM tree
    const subtreeSize = Array.from(element.querySelectorAll("*")).filter(
      (child) => !isInOverlay(child),
    ).length;
    return DOMRect.fromRect({
      x: 0,
      y: elements.indexOf(element) * ROW_HEIGHT,
      width: 300,
      height: (subtreeSize + 1) * ROW_HEIGHT,
    });
  };
  const overlayRect = getRect(overlayRectOf);
  getRectMock.mockImplementation(function (this: HTMLElement) {
    if (!container.contains(this)) {
      return defaultGetRect.call(this);
    }
    return isInOverlay(this) ? overlayRect : getRect(this);
  });
}

/** jsdom has no PointerEvent, so a mouse event stands in for it */
function firePointerEvent(
  target: Element | Document,
  type: "pointerdown" | "pointermove" | "pointerup",
  { clientX, clientY }: { clientX: number; clientY: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
  });
  Object.defineProperty(event, "isPrimary", { value: true });
  fireEvent(target, event);
}

/** Drags one sortable item of the pivot settings onto another */
async function dragColumn({
  from,
  to,
}: {
  from: HTMLElement;
  to: HTMLElement;
}) {
  // the sortable wrappers are the nodes that dnd-kit measures
  // eslint-disable-next-line testing-library/no-node-access -- the wrappers have no role or test id
  const fromNode = checkNotNull(from.parentElement);
  // eslint-disable-next-line testing-library/no-node-access -- the wrappers have no role or test id
  const toNode = checkNotNull(to.parentElement);
  mockDocumentOrderLayout(
    screen.getByTestId("chartsettings-sidebar"),
    fromNode,
  );
  const handle = within(from).getByTestId("drag-handle");
  const start = fromNode.getBoundingClientRect();
  const end = toNode.getBoundingClientRect();
  const clientX = 10;
  const clientY = start.top + 5;
  const deltaY = end.top - start.top;
  const nextFrame = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 0)));

  firePointerEvent(handle, "pointerdown", { clientX, clientY });
  // further than the distance that starts a drag
  firePointerEvent(document, "pointermove", { clientX, clientY: clientY - 20 });
  await nextFrame();
  firePointerEvent(document, "pointermove", {
    clientX,
    clientY: clientY + deltaY,
  });
  await nextFrame();
  firePointerEvent(document, "pointerup", {
    clientX,
    clientY: clientY + deltaY,
  });
  await nextFrame();
}

/** What a page reload resets */
async function resetPage() {
  cleanup();
  resetRouterForTests();
  await fetchMock.callHistory.flush();
  fetchMock.removeRoutes();
  fetchMock.callHistory.clear();
  fetchMock.post("path:/api/frontend-errors", 200);
  setupLastDownloadFormatEndpoints();
}

function assertSourceSumsPivotTable() {
  expect(getInPivotTable("User → Source")).toBeVisible();
  expect(getInPivotTable("Sum of Subtotal")).toBeVisible();
  expect(getInPivotTable("Sum of Total")).toBeVisible();
  expect(getInPivotTable("Grand totals")).toBeVisible();
}

function isOrderedByFirstAggregation(stage: SubmittedStage) {
  const orderBy = JSON.stringify(stage["order-by"] ?? []);
  return /^\[\["asc",\{[^\]]*\},\["aggregation",/.test(orderBy);
}

function getLastPivotBody() {
  const calls = getPivotCalls();
  expect(calls.length).toBeGreaterThan(0);
  return parseBody(calls[calls.length - 1]);
}

/** Texts of the body cells, by row */
function getBodyRows() {
  const body = screen.getByLabelText(PIVOT_TABLE_BODY_LABEL);
  const cells = within(body).getAllByTestId("pivot-table-cell");
  const rows = _.groupBy(cells, (cell) =>
    // eslint-disable-next-line testing-library/no-node-access -- the grid positions the wrapper of each cell
    parseInt(cell.parentElement?.style.top ?? "0"),
  );
  return _.sortBy(Object.entries(rows), ([top]) => Number(top)).map(
    ([, rowCells]) => rowCells.map((cell) => cell.textContent),
  );
}

function getBodyCellTexts() {
  return getBodyRows().flat();
}

function getFirstRowTotal() {
  const [firstRow] = getBodyRows();
  return firstRow[firstRow.length - 1];
}

function getPivotCell(text: string) {
  const cells = within(getPivotTable()).getAllByTestId("pivot-table-cell");
  return checkNotNull(
    cells.find((cell) => within(cell).queryByText(text) != null),
  );
}

async function sortColumn(
  columnName: string,
  direction: "ascending" | "descending",
) {
  await openVizSettings();
  await userEvent.click(
    await screen.findByTestId(`${columnName}-settings-button`),
  );
  await userEvent.click(
    await screen.findByLabelText(
      direction === "ascending" ? "arrow_up icon" : "arrow_down icon",
    ),
  );
}
