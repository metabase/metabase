import { mockSettings } from "__support__/settings";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import type { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockStructuredDatasetQuery,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

const testDatasetQuery = () =>
  createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: { "source-table": ORDERS_ID },
  });

export const TABLE_CARD = createMockCard({
  display: "table",
  dataset_query: testDatasetQuery(),
});

export const TABLE_RESULT = createMockDataset({
  data: {
    cols: [
      createMockColumn({
        name: "NAME",
        display_name: "Name",
        base_type: "type/Text",
      }),
      createMockColumn({
        name: "TOTAL",
        display_name: "Total",
        base_type: "type/Float",
      }),
    ],
    rows: [["Widget", 10.5]],
  },
});

export const PIVOT_CARD = createMockCard({
  display: "pivot",
  dataset_query: testDatasetQuery(),
  visualization_settings: {
    "pivot_table.column_split": {
      rows: ["CATEGORY"],
      columns: ["VENDOR"],
      values: ["COUNT"],
    },
    "pivot.show_row_totals": false,
    "pivot.show_column_totals": false,
  },
});

export const PIVOT_RESULT = createMockDataset({
  data: {
    cols: [
      createMockColumn({
        name: "CATEGORY",
        display_name: "Category",
        base_type: "type/Text",
        source: "breakout",
      }),
      createMockColumn({
        name: "VENDOR",
        display_name: "Vendor",
        base_type: "type/Text",
        source: "breakout",
      }),
      createMockColumn({
        name: "COUNT",
        display_name: "Count",
        base_type: "type/Integer",
        source: "aggregation",
      }),
      createMockColumn({
        name: "pivot-grouping",
        display_name: "pivot-grouping",
        base_type: "type/Integer",
      }),
    ],
    rows: [
      ["Doohickey", "Alpha", 10, 0],
      ["Doohickey", "Beta", 20, 0],
      [null, "Alpha", 30, 1],
    ],
  },
});

export const CLASSIC_PIVOT_CARD = createMockCard({
  display: "table",
  dataset_query: testDatasetQuery(),
  visualization_settings: {
    "table.pivot": true,
    "table.pivot_column": "VENDOR",
    "table.cell_column": "COUNT",
  },
});

export const CLASSIC_PIVOT_RESULT = createMockDataset({
  data: {
    cols: [
      createMockColumn({
        name: "CATEGORY",
        display_name: "Category",
        base_type: "type/Text",
        source: "breakout",
      }),
      createMockColumn({
        name: "VENDOR",
        display_name: "Vendor",
        base_type: "type/Text",
        source: "breakout",
      }),
      createMockColumn({
        name: "COUNT",
        display_name: "Count",
        base_type: "type/Integer",
        source: "aggregation",
      }),
    ],
    rows: [
      ["Doohickey", "Alpha", 10],
      ["Doohickey", "Beta", 20],
      ["Gizmo", "Alpha", 30],
    ],
  },
});

export const DETAILS_TABLE_RESULT = createMockDataset({
  data: {
    cols: [
      ...TABLE_RESULT.data.cols,
      createMockColumn({
        name: "RAW_JSON",
        display_name: "Raw JSON",
        base_type: "type/Text",
        visibility_type: "details-only",
      }),
    ],
    rows: [["Widget", 10.5, "{}"]],
  },
});

// One observation per distinct row/column key pair, so the logical pivot grid
// is size × size while the source stays at size rows
export const createSparsePivotResult = (size: number) =>
  createMockDataset({
    data: {
      ...PIVOT_RESULT.data,
      rows: Array.from({ length: size }, (_, index) => [
        `row-${index}`,
        `column-${index}`,
        1,
        0,
      ]),
    },
  });

export const createSparseClassicPivotResult = (size: number) =>
  createMockDataset({
    data: {
      ...CLASSIC_PIVOT_RESULT.data,
      rows: Array.from({ length: size }, (_, index) => [
        `row-${index}`,
        `column-${index}`,
        1,
      ]),
    },
  });

// Cardinality high enough that the table renders flat instead of auto-pivoting.
// Unique column names: the column-cardinality cache is module-global, name-keyed
export const createSparseAggregateResult = (size: number) =>
  createMockDataset({
    data: {
      cols: [
        createMockColumn({
          name: "AUTOPIVOT_DIM_A",
          display_name: "Dim A",
          base_type: "type/Text",
          source: "breakout",
        }),
        createMockColumn({
          name: "AUTOPIVOT_DIM_B",
          display_name: "Dim B",
          base_type: "type/Text",
          source: "breakout",
        }),
        createMockColumn({
          name: "AUTOPIVOT_COUNT",
          display_name: "Count",
          base_type: "type/Integer",
          semantic_type: "type/Quantity",
          source: "aggregation",
        }),
      ],
      rows: Array.from({ length: size }, (_, index) => [
        `a-${index}`,
        `b-${index}`,
        1,
      ]),
    },
  });

export const ALL_HIDDEN_TABLE_CARD = createMockCard({
  display: "table",
  dataset_query: testDatasetQuery(),
  visualization_settings: {
    "table.columns": [
      { name: "NAME", enabled: false },
      { name: "TOTAL", enabled: false },
    ],
  },
});

export const LINE_CARD = createMockCard({
  display: "line",
  dataset_query: testDatasetQuery(),
});

export const SCALAR_CARD = createMockCard({
  display: "scalar",
  dataset_query: testDatasetQuery(),
});

export const OBJECT_CARD = createMockCard({
  display: "object",
  dataset_query: testDatasetQuery(),
});

export const OBJECT_CARD_WITH_HIDDEN_COLUMN = createMockCard({
  display: "object",
  dataset_query: testDatasetQuery(),
  visualization_settings: {
    "table.columns": [
      { name: "NAME", enabled: false },
      { name: "TOTAL", enabled: true },
      { name: "RAW_JSON", enabled: true },
    ],
  },
});

export const ALL_HIDDEN_OBJECT_CARD = createMockCard({
  display: "object",
  dataset_query: testDatasetQuery(),
  visualization_settings: {
    "table.columns": [
      { name: "NAME", enabled: false },
      { name: "TOTAL", enabled: false },
      { name: "RAW_JSON", enabled: false },
    ],
  },
});

export const createViewFooterState = ({
  card,
  result,
  lastRunCard = card,
  isRunning = false,
  isShowingRawTable = false,
  pivotedExportsEnabled = true,
  whitelabeled = false,
}: {
  card: Card;
  result: Dataset;
  lastRunCard?: Card;
  isRunning?: boolean;
  isShowingRawTable?: boolean;
  pivotedExportsEnabled?: boolean;
  whitelabeled?: boolean;
}) =>
  createMockState({
    entities: createMockEntitiesState({ questions: [card] }),
    settings: mockSettings({
      "enable-pivoted-exports": pivotedExportsEnabled,
      "token-features": createMockTokenFeatures({ whitelabel: whitelabeled }),
    }),
    qb: createMockQueryBuilderState({
      card,
      lastRunCard,
      queryResults: [result],
      uiControls: createMockQueryBuilderUIControlsState({
        isRunning,
        isShowingRawTable,
      }),
    }),
  });
