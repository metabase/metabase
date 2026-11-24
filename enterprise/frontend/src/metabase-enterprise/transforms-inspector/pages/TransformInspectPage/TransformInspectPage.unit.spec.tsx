import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabaseListEndpoint,
  setupGetTransformEndpoint,
  setupInspectorDiscoveryEndpoint,
  setupInspectorLensEndpoint,
  setupListTransformJobsEndpoint,
  setupListTransformTagsEndpoint,
  setupRunInspectorQueryEndpoint,
  setupRunTransformEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Dataset,
  InspectorCard,
  InspectorDiscoveryResponse,
  InspectorField,
  InspectorLens,
  InspectorLensMetadata,
  RowValue,
  Transform,
} from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDatabase,
  createMockDataset,
  createMockInspectorCard,
  createMockTokenFeatures,
  createMockTransform,
  createMockTransformInspectSource,
  createMockTransformRun,
} from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

registerVisualizations();

const TRANSFORM_ID = 7;
const ANIMALS_TABLE_ID = 11;
const TARGET_TABLE_ID = 12;
const JOINED_TABLE_ID = 13;
const TARGET_TABLE_NAME = "inspect_target_table";
const INSPECT_PATH = `/data-studio/transforms/${TRANSFORM_ID}/inspect`;
const DISCOVERY_PATH = `path:/api/ee/transforms/${TRANSFORM_ID}/inspect`;

const SUMMARY_LENS: InspectorLensMetadata = {
  id: "generic-summary",
  display_name: "Data Summary",
  complexity: { level: "fast" },
};

const COLUMN_DISTRIBUTIONS_LENS: InspectorLensMetadata = {
  id: "column-comparison",
  display_name: "Column Distributions",
  complexity: { level: "slow" },
};

const JOIN_ANALYSIS_LENS: InspectorLensMetadata = {
  id: "join-analysis",
  display_name: "Join Analysis",
  complexity: { level: "very-slow" },
};

const FIELDS: InspectorField[] = [
  {
    id: 101,
    name: "name",
    display_name: "Name",
    base_type: "type/Text",
    stats: { distinct_count: 3, nil_percent: 0 },
  },
  {
    id: 102,
    name: "score",
    display_name: "Score",
    base_type: "type/Integer",
    stats: { distinct_count: 3, nil_percent: 0 },
  },
];

function nativeQuery(sql: string) {
  return Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, { query: sql });
}

function countDataset(row: RowValue[]): Dataset {
  return createMockDataset({
    data: {
      rows: [row],
      cols: row.map((_, index) =>
        createMockColumn({ name: `count_${index}`, base_type: "type/Integer" }),
      ),
    },
  });
}

const DISTRIBUTION_DATASET = createMockDataset({
  data: {
    rows: [
      ["a", 2],
      ["b", 1],
    ],
    cols: [
      createMockColumn({
        name: "value",
        display_name: "Value",
        base_type: "type/Text",
        source: "breakout",
      }),
      createMockColumn({
        name: "count",
        display_name: "Count",
        base_type: "type/Integer",
        source: "aggregation",
      }),
    ],
  },
});

const EMPTY_DATASET = createMockDataset({ data: { rows: [], cols: [] } });

/** Answers a card query with the dataset for the SQL in the request body, and with no rows for any other query. */
function queryResponder(rowsBySql: Record<string, Dataset>) {
  return (call: CallLog) => {
    const body = String(call.options.body);
    const match = Object.entries(rowsBySql).find(([sql]) =>
      body.includes(JSON.stringify(sql)),
    );
    return match ? match[1] : EMPTY_DATASET;
  };
}

const ANIMALS_COUNT_SQL = "SELECT COUNT(*) FROM animals";
const TARGET_COUNT_SQL = "SELECT COUNT(*) FROM inspect_target_table";

const SUMMARY_LENS_RESPONSE: InspectorLens = {
  id: "generic-summary",
  display_name: "Data Summary",
  sections: [{ id: "row-counts", title: "Row Counts", layout: "comparison" }],
  cards: [
    createMockInspectorCard({
      id: "Animals-row-count",
      section_id: "row-counts",
      title: "Animals Row Count",
      display: "scalar",
      dataset_query: nativeQuery(ANIMALS_COUNT_SQL),
      metadata: {
        card_type: "table_count",
        dedup_key: ["table_count", ANIMALS_TABLE_ID],
        group_id: "row-count",
        group_role: "input",
        group_order: 0,
        table_id: ANIMALS_TABLE_ID,
      },
    }),
    createMockInspectorCard({
      id: `${TARGET_TABLE_NAME}-row-count`,
      section_id: "row-counts",
      title: `${TARGET_TABLE_NAME} Row Count`,
      display: "scalar",
      dataset_query: nativeQuery(TARGET_COUNT_SQL),
      metadata: {
        card_type: "table_count",
        dedup_key: ["table_count", TARGET_TABLE_ID],
        group_id: "row-count",
        group_role: "output",
        group_order: 0,
        table_id: TARGET_TABLE_ID,
      },
    }),
  ],
};

const SUMMARY_QUERY_ROWS = {
  [ANIMALS_COUNT_SQL]: countDataset([3]),
  [TARGET_COUNT_SQL]: countDataset([5]),
};

function distributionSql(field: InspectorField, tableName: string) {
  return `SELECT ${field.name}, COUNT(*) FROM ${tableName} GROUP BY 1`;
}

function distributionCard({
  field,
  tableName,
  tableId,
  role,
}: {
  field: InspectorField;
  tableName: string;
  tableId: number;
  role: "input" | "output";
}): InspectorCard {
  return createMockInspectorCard({
    id: `${tableName}-${field.name}-distribution`,
    section_id: "comparisons",
    title: `${field.name} (${tableName})`,
    display: "bar",
    dataset_query: nativeQuery(distributionSql(field, tableName)),
    metadata: {
      card_type: "table_count",
      dedup_key: [tableName, field.name],
      group_id: field.name,
      group_role: role,
      table_id: tableId,
      field_id: field.id,
    },
  });
}

const DISTRIBUTION_CARDS = FIELDS.flatMap((field) => [
  distributionCard({
    field,
    tableName: "Animals",
    tableId: ANIMALS_TABLE_ID,
    role: "input",
  }),
  distributionCard({
    field,
    tableName: TARGET_TABLE_NAME,
    tableId: TARGET_TABLE_ID,
    role: "output",
  }),
]);

const COLUMN_DISTRIBUTIONS_LENS_RESPONSE: InspectorLens = {
  id: "column-comparison",
  display_name: "Column Distributions",
  sections: [
    { id: "comparisons", title: "2 matched columns", layout: "comparison" },
  ],
  cards: DISTRIBUTION_CARDS,
};

const DISTRIBUTION_QUERY_ROWS = Object.fromEntries(
  FIELDS.flatMap((field) =>
    ["Animals", TARGET_TABLE_NAME].map((tableName) => [
      distributionSql(field, tableName),
      DISTRIBUTION_DATASET,
    ]),
  ),
);

const BASE_COUNT_SQL = "SELECT COUNT(*) FROM animals_base";
const JOIN_STEP_SQL = "SELECT COUNT(*) FROM animals_base JOIN animals_joined";
const JOINED_TABLE_COUNT_SQL = "SELECT COUNT(*) FROM animals_joined";

const JOIN_ANALYSIS_LENS_RESPONSE: InspectorLens = {
  id: "join-analysis",
  display_name: "Join Analysis",
  sections: [{ id: "join-stats", title: "Join Statistics", layout: "flat" }],
  cards: [
    createMockInspectorCard({
      id: "base-count",
      section_id: "join-stats",
      title: "Base Row Count",
      display: "scalar",
      dataset_query: nativeQuery(BASE_COUNT_SQL),
      metadata: {
        card_type: "base_count",
        dedup_key: ["table_count", ANIMALS_TABLE_ID],
      },
    }),
    createMockInspectorCard({
      id: "join-step-1",
      section_id: "join-stats",
      title: "Join 1: Animals - Name",
      display: "table",
      dataset_query: nativeQuery(JOIN_STEP_SQL),
      metadata: {
        card_type: "join_step",
        dedup_key: ["join_step", 1],
        join_step: 1,
        join_alias: "Animals - Name",
        join_strategy: "inner-join",
      },
    }),
    createMockInspectorCard({
      id: "table-1-count",
      section_id: "join-stats",
      title: "Animals Row Count",
      display: "scalar",
      dataset_query: nativeQuery(JOINED_TABLE_COUNT_SQL),
      metadata: {
        card_type: "table_count",
        dedup_key: ["table_count", JOINED_TABLE_ID],
        join_step: 1,
        table_id: JOINED_TABLE_ID,
      },
    }),
  ],
  alert_triggers: [],
  drill_lens_triggers: [],
};

const JOIN_QUERY_ROWS = {
  [BASE_COUNT_SQL]: countDataset([6]),
  [JOIN_STEP_SQL]: countDataset([4]),
  [JOINED_TABLE_COUNT_SQL]: countDataset([9]),
};

function createDiscovery(
  availableLenses: InspectorLensMetadata[],
): InspectorDiscoveryResponse {
  return {
    name: "Inspected transform",
    status: "ready",
    sources: [
      createMockTransformInspectSource({
        table_id: ANIMALS_TABLE_ID,
        table_name: "Animals",
        column_count: 2,
        fields: FIELDS,
      }),
    ],
    target: {
      table_id: TARGET_TABLE_ID,
      table_name: TARGET_TABLE_NAME,
      column_count: 2,
      fields: FIELDS,
    },
    available_lenses: availableLenses,
  };
}

const MBQL_SOURCE: Transform["source"] = {
  type: "query",
  query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  }),
};

const SQL_SOURCE: Transform["source"] = {
  type: "query",
  query: nativeQuery("SELECT * FROM animals"),
};

type SetupOpts = {
  source?: Transform["source"];
  lastRun?: Transform["last_run"];
  availableLenses?: InspectorLensMetadata[];
  lenses?: InspectorLens[];
  queryRows?: Record<string, Dataset>;
  queryDelayMsByLens?: Record<InspectorLens["id"], number>;
};

function setup({
  source = MBQL_SOURCE,
  lastRun = createMockTransformRun({ status: "succeeded" }),
  availableLenses = [SUMMARY_LENS, COLUMN_DISTRIBUTIONS_LENS],
  lenses = [SUMMARY_LENS_RESPONSE, COLUMN_DISTRIBUTIONS_LENS_RESPONSE],
  queryRows = { ...SUMMARY_QUERY_ROWS, ...DISTRIBUTION_QUERY_ROWS },
  queryDelayMsByLens = {},
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 800, height: 400 });

  let transform = createMockTransform({
    id: TRANSFORM_ID,
    name: "Inspected transform",
    source,
    last_run: lastRun,
  });

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      "transforms-python": true,
    }),
  });
  setupEnterprisePlugins();

  setupGetTransformEndpoint(transform, () => transform);
  setupRunTransformEndpoint(TRANSFORM_ID, () => {
    transform = {
      ...transform,
      last_run: createMockTransformRun({ id: 2, status: "succeeded" }),
    };
    return { run_id: 2 };
  });
  setupDatabaseListEndpoint([
    createMockDatabase({ id: SAMPLE_DB_ID, transforms_permissions: "write" }),
  ]);
  setupListTransformTagsEndpoint([]);
  setupListTransformJobsEndpoint([]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  fetchMock.post(
    "path:/api/dataset/query_metadata",
    createMockCardQueryMetadata(),
  );

  setupInspectorDiscoveryEndpoint(
    TRANSFORM_ID,
    createDiscovery(availableLenses),
  );
  lenses.forEach((lens) =>
    setupInspectorLensEndpoint(TRANSFORM_ID, lens.id, lens),
  );
  lenses.forEach((lens) =>
    setupRunInspectorQueryEndpoint(
      TRANSFORM_ID,
      lens.id,
      queryResponder(queryRows),
      { delayMs: queryDelayMsByLens[lens.id] },
    ),
  );

  renderWithProviders(
    <Route path="/data-studio/transforms">
      {PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes()}
    </Route>,
    {
      withRouter: true,
      initialRoute: INSPECT_PATH,
      storeInitialState: createMockState({ settings }),
    },
  );
}

const getTab = (name: RegExp) => screen.getByRole("tab", { name });

function getTreegridRows(treegrid: HTMLElement) {
  return within(treegrid)
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("gridcell").length > 0);
}

function getCellTexts(row: HTMLElement) {
  return within(row)
    .getAllByRole("gridcell")
    .map((cell) => cell.textContent);
}

describe("TransformInspectPage", () => {
  describe("pre-run state", () => {
    it("shows an alert until the transform is run, then shows the Summary lens", async () => {
      setup({ lastRun: null });

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        /^To inspect the transform you need to run it first\.$/,
      );
      expect(
        screen.queryByRole("tab", { name: /Summary/ }),
      ).not.toBeInTheDocument();
      expect(fetchMock.callHistory.called(DISCOVERY_PATH)).toBe(false);

      await userEvent.click(screen.getByTestId("run-button"));

      expect(
        await screen.findByRole("tab", { name: /Summary/ }),
      ).toBeInTheDocument();
      expect(fetchMock.callHistory.called(DISCOVERY_PATH)).toBe(true);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        await screen.findByRole("heading", { name: /1 input table/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /1 output table/i }),
      ).toBeInTheDocument();

      const treegrids = screen.getAllByRole("treegrid");
      expect(treegrids).toHaveLength(4);
      const [inputTables, outputTables] = within(
        screen.getByTestId("generic-summary-tables"),
      ).getAllByRole("treegrid");
      expect(
        await within(inputTables).findByText("Animals"),
      ).toBeInTheDocument();
      expect(
        within(outputTables).queryByText("Animals"),
      ).not.toBeInTheDocument();
      expect(
        within(outputTables).getByText(TARGET_TABLE_NAME),
      ).toBeInTheDocument();
    });
  });

  describe("generic-summary lens", () => {
    it.each([
      { sourceType: "MBQL", source: MBQL_SOURCE },
      { sourceType: "SQL", source: SQL_SOURCE },
    ])(
      "selects the Summary tab and shows the input and output tables for a $sourceType transform",
      async ({ source }) => {
        setup({ source });

        const summaryTab = await screen.findByRole("tab", { name: /Summary/ });
        expect(summaryTab).toHaveAttribute("aria-selected", "true");
        expect(getTab(/Column Distributions/)).toHaveAttribute(
          "aria-selected",
          "false",
        );
        expect(
          await screen.findByRole("heading", { name: /1 input table/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("heading", { name: /1 output table/i }),
        ).toBeInTheDocument();

        const [inputTables, outputTables] = within(
          screen.getByTestId("generic-summary-tables"),
        ).getAllByRole("treegrid");
        await waitFor(() =>
          expect(getCellTexts(getTreegridRows(inputTables)[0])).toEqual([
            "Animals",
            "3",
            "2",
          ]),
        );
        await waitFor(() =>
          expect(getCellTexts(getTreegridRows(outputTables)[0])).toEqual([
            TARGET_TABLE_NAME,
            "5",
            "2",
          ]),
        );
      },
    );

    it("shows the loading spinner only on the active tab", async () => {
      // Summary stays loading until after the switch to Column Distributions
      setup({
        queryDelayMsByLens: {
          [SUMMARY_LENS.id]: 1000,
          [COLUMN_DISTRIBUTIONS_LENS.id]: 300,
        },
      });

      const summaryTab = await screen.findByRole("tab", { name: /Summary/ });
      const columnDistributionsTab = getTab(/Column Distributions/);

      expect(
        await within(summaryTab).findByTestId("lens-tab-loader"),
      ).toBeInTheDocument();
      expect(
        within(columnDistributionsTab).queryByTestId("lens-tab-loader"),
      ).not.toBeInTheDocument();
      expect(
        within(columnDistributionsTab).getByLabelText("clock icon"),
      ).toBeInTheDocument();

      await userEvent.click(columnDistributionsTab);

      expect(
        within(summaryTab).queryByTestId("lens-tab-loader"),
      ).not.toBeInTheDocument();
      expect(
        within(summaryTab).queryByLabelText("clock icon"),
      ).not.toBeInTheDocument();
      expect(
        within(columnDistributionsTab).getByTestId("lens-tab-loader"),
      ).toBeInTheDocument();

      expect(await screen.findAllByTestId("visualization-root")).toHaveLength(
        4,
      );
      await waitFor(() =>
        expect(
          within(columnDistributionsTab).queryByTestId("lens-tab-loader"),
        ).not.toBeInTheDocument(),
      );
      expect(
        within(columnDistributionsTab).queryByLabelText("clock icon"),
      ).not.toBeInTheDocument();

      await userEvent.click(summaryTab);

      expect(
        within(columnDistributionsTab).queryByTestId("lens-tab-loader"),
      ).not.toBeInTheDocument();
      expect(
        within(columnDistributionsTab).queryByLabelText("clock icon"),
      ).not.toBeInTheDocument();
      expect(
        await screen.findByTestId("generic-summary-tables"),
      ).toBeInTheDocument();
      await waitFor(
        () =>
          expect(
            within(summaryTab).queryByTestId("lens-tab-loader"),
          ).not.toBeInTheDocument(),
        { timeout: 3000 },
      );
    });
  });

  describe("join-analysis lens", () => {
    it("shows the join steps in a tree table", async () => {
      setup({
        availableLenses: [SUMMARY_LENS, JOIN_ANALYSIS_LENS],
        lenses: [SUMMARY_LENS_RESPONSE, JOIN_ANALYSIS_LENS_RESPONSE],
        queryRows: { ...SUMMARY_QUERY_ROWS, ...JOIN_QUERY_ROWS },
      });

      expect(
        await screen.findByRole("tab", { name: /Summary/ }),
      ).toBeInTheDocument();
      const joinAnalysisTab = getTab(/Join Analysis/);
      expect(
        within(joinAnalysisTab).getByLabelText("clock icon"),
      ).toBeInTheDocument();

      await userEvent.click(joinAnalysisTab);

      expect(
        within(joinAnalysisTab).queryByLabelText("clock icon"),
      ).not.toBeInTheDocument();
      expect(
        await screen.findByRole("heading", { name: /1 join/i }),
      ).toBeInTheDocument();

      const treegrid = screen.getByRole("treegrid");
      expect(within(treegrid).getByText("Join")).toBeInTheDocument();
      expect(within(treegrid).getByText("Output")).toBeInTheDocument();
      expect(within(treegrid).getByText("Matched")).toBeInTheDocument();
      expect(within(treegrid).getByText("Table rows")).toBeInTheDocument();

      await waitFor(() =>
        expect(getCellTexts(getTreegridRows(treegrid)[0])).toEqual([
          "",
          "Animals - Name",
          "4",
          "4",
          "9",
        ]),
      );
    });
  });
});
