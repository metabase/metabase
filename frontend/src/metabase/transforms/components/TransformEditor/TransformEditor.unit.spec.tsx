import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupAdhocQueryMetadataEndpoint } from "__support__/server-mocks/dataset";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { createMockEntitiesState } from "metabase/metadata-store";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  DatasetColumn,
  DatasetQuery,
  QueryTransformSource,
  RowValues,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  PEOPLE,
  PEOPLE_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

import { TransformEditor } from "./TransformEditor";

registerVisualizations();

type DatasetFixture = {
  cols: DatasetColumn[];
  rows: RowValues[];
};

// A PK column, like the e2e that set `name` to `type/PK`.
const NAME_PK_COLUMN = createMockColumn({
  name: "NAME",
  display_name: "Name",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: "type/PK",
  source: "fields",
});

const SCORE_COLUMN = createMockColumn({
  name: "SCORE",
  display_name: "Score",
  base_type: "type/Integer",
  effective_type: "type/Integer",
  semantic_type: null,
  source: "fields",
});

const PK_DATASET: DatasetFixture = {
  cols: [NAME_PK_COLUMN, SCORE_COLUMN],
  rows: [
    ["Alice", 10],
    ["Bob", 20],
  ],
};

const COUNT_BY_NAME_AND_SCORE_DATASET: DatasetFixture = {
  cols: [
    createMockColumn({
      name: "NAME",
      display_name: "Name",
      base_type: "type/Text",
      effective_type: "type/Text",
      semantic_type: "type/Category",
      source: "breakout",
    }),
    createMockColumn({
      name: "SCORE",
      display_name: "Score",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      semantic_type: "type/Category",
      source: "breakout",
    }),
    createMockColumn({
      name: "count",
      display_name: "Count",
      base_type: "type/BigInteger",
      effective_type: "type/BigInteger",
      semantic_type: "type/Quantity",
      source: "aggregation",
    }),
  ],
  rows: [
    ["Alice", 10, 1],
    ["Alice", 20, 2],
    ["Bob", 10, 3],
    ["Bob", 20, 4],
  ],
};

const PEOPLE_QUERY: DatasetQuery = Lib.toJsQuery(
  Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: PEOPLE_ID } }],
  }),
);

const COUNT_BY_NAME_AND_SOURCE_QUERY: DatasetQuery = Lib.toJsQuery(
  Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PEOPLE_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
        breakouts: [
          { type: "column", fieldId: PEOPLE.NAME },
          { type: "column", fieldId: PEOPLE.SOURCE },
        ],
      },
    ],
  }),
);

function getStage(body: unknown) {
  const stages = isObject(body) ? body.stages : undefined;
  const stage = Array.isArray(stages) ? stages[0] : undefined;
  return isObject(stage) ? stage : undefined;
}

function hasPeopleSourceTable(body: unknown) {
  return getStage(body)?.["source-table"] === PEOPLE_ID;
}

function isCountByTwoBreakouts(body: unknown) {
  const stage = getStage(body);
  return (
    Array.isArray(stage?.aggregation) &&
    stage.aggregation.length === 1 &&
    Array.isArray(stage?.breakout) &&
    stage.breakout.length === 2
  );
}

function setupDatasetEndpoint(
  dataset: DatasetFixture,
  matchesQuery: (body: unknown) => boolean,
) {
  fetchMock.post("path:/api/dataset", ({ options }) => {
    const body = JSON.parse(String(options.body));
    if (!hasPeopleSourceTable(body) || !matchesQuery(body)) {
      return createMockDataset({ data: { cols: [], rows: [] } });
    }
    return createMockDataset({
      data: dataset,
      row_count: dataset.rows.length,
    });
  });
}

function getDatasetRequestBody() {
  const call = fetchMock.callHistory.lastCall("path:/api/dataset");
  return JSON.parse(String(call?.options.body));
}

function TestTransformEditor({ query }: { query: DatasetQuery }) {
  const [source, setSource] = useState<QueryTransformSource>({
    type: "query",
    query,
  });
  const [uiState, setUiState] = useState(getInitialUiState);

  return (
    <TransformEditor
      source={source}
      uiState={uiState}
      databases={[createSampleDatabase()]}
      onChangeSource={setSource}
      onChangeUiState={setUiState}
      isEditMode
    />
  );
}

function setup({ query }: { query: DatasetQuery }) {
  const state = createMockState({
    settings: mockSettings({
      "transforms-enabled": true,
      "token-features": createMockTokenFeatures({ transforms: true }),
    }),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });
  setupEnterprisePlugins();
  setupAdhocQueryMetadataEndpoint(createMockCardQueryMetadata({}));

  renderWithProviders(<TestTransformEditor query={query} />, {
    storeInitialState: state,
  });
}

async function runPreview() {
  await userEvent.click(await screen.findByTestId("run-button"));
  await waitFor(() =>
    expect(fetchMock.callHistory.called("path:/api/dataset")).toBe(true),
  );
}

function getHeaderNames() {
  return screen
    .getAllByTestId("header-cell")
    .map((header) => header.textContent);
}

function renderTableVisualization(dataset: DatasetFixture) {
  renderWithProviders(
    <Visualization
      rawSeries={[
        {
          card: createMockCard({
            dataset_query: PEOPLE_QUERY,
            display: "table",
            visualization_settings: {},
          }),
          ...createMockDataset({ data: dataset }),
        },
      ]}
      queryBuilderMode="view"
      width={600}
      height={400}
    />,
  );
}

describe("TransformEditor", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  describe("query preview", () => {
    it("does not show the object detail button for PK columns (metabase#64473)", async () => {
      setupDatasetEndpoint(PK_DATASET, () => true);
      setup({ query: PEOPLE_QUERY });

      await runPreview();
      const queryEditor = screen.getByTestId("query-visualization-root");
      await within(queryEditor).findByText("Bob");

      expect(getDatasetRequestBody()).toMatchObject({
        database: SAMPLE_DB_ID,
      });
      expect(getHeaderNames()).toEqual(["Name", "Score"]);
      expect(within(queryEditor).queryAllByTestId("detail-shortcut")).toEqual(
        [],
      );
    });

    it("does not auto-pivot results with one aggregation and two breakouts", async () => {
      setupDatasetEndpoint(
        COUNT_BY_NAME_AND_SCORE_DATASET,
        isCountByTwoBreakouts,
      );
      setup({ query: COUNT_BY_NAME_AND_SOURCE_QUERY });

      await runPreview();
      await screen.findAllByText("Bob");

      expect(isCountByTwoBreakouts(getDatasetRequestBody())).toBe(true);
      expect(getHeaderNames()).toEqual(["Name", "Score", "Count"]);
      expect(screen.getAllByText("Bob")).toHaveLength(2);
    });
  });

  // Positive controls: the same results outside the transform editor.
  describe("table visualization outside the transform editor", () => {
    it("shows the object detail button for a PK column", async () => {
      renderTableVisualization(PK_DATASET);

      expect(await screen.findByText("Bob")).toBeInTheDocument();
      expect(screen.getAllByTestId("detail-shortcut")).toHaveLength(2);
    });

    it("auto-pivots results with one aggregation and two breakouts", async () => {
      renderTableVisualization(COUNT_BY_NAME_AND_SCORE_DATASET);

      await screen.findByText("Bob");
      expect(getHeaderNames()).toEqual(["Score", "Alice", "Bob"]);
    });
  });
});
