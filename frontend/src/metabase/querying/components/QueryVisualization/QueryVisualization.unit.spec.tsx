import userEvent from "@testing-library/user-event";

import { createMockMetadataFromState } from "__support__/metadata";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { act, renderWithProviders, screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { OnOpenChartSettings } from "metabase/visualizations/types";
import { loadVisualizationComponents } from "metabase/viz-core";
import Question from "metabase-lib/v1/Question";
import type {
  Dataset,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { QueryVisualization } from "./QueryVisualization";

registerVisualizations();

// Chart components are loaded on demand. Register the line chart up front so
// each test renders in one pass and can be run on its own.
beforeAll(() => loadVisualizationComponents(["line"]));

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});
const metadata = createMockMetadataFromState(state);

const GOAL_SETTINGS: VisualizationSettings = {
  "graph.dimensions": ["month"],
  "graph.metrics": ["count"],
  "graph.show_goal": true,
  "graph.goal_value": { type: "card", id: 9, column: "goal" },
};

type ResultOpts = {
  referencedEntities?: DatasetData["referenced_entities"];
  rowsTruncated?: number;
};

type SetupOpts = ResultOpts & {
  canOpenChartSettings?: boolean;
};

async function setup({
  referencedEntities,
  rowsTruncated,
  canOpenChartSettings = true,
}: SetupOpts = {}) {
  const onOpenChartSettings = jest.fn<void, Parameters<OnOpenChartSettings>>();
  const question = new Question(
    {
      dataset_query: {
        type: "query",
        query: { "source-table": ORDERS_ID },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: GOAL_SETTINGS,
    },
    metadata,
  );

  function getVisualization(result: Dataset) {
    return (
      <QueryVisualization
        question={question}
        result={result}
        rawSeries={[{ card: question.card(), data: result.data }]}
        onOpenChartSettings={
          canOpenChartSettings ? onOpenChartSettings : undefined
        }
      />
    );
  }

  jest.useFakeTimers({ advanceTimers: true });
  const { rerender } = renderWithProviders(
    getVisualization(createResult({ referencedEntities, rowsTruncated })),
  );
  await waitForChartSize();

  async function rerenderWithResult(result: Dataset) {
    rerender(getVisualization(result));
    await waitForChartSize();
  }

  return { onOpenChartSettings, rerenderWithResult };
}

describe("QueryVisualization", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a goal warning that opens the display settings when the goal value cannot be resolved", async () => {
    const { onOpenChartSettings } = await setup({
      referencedEntities: createMockFailedReferencedEntitiesResults(),
    });

    const warning = screen.getByRole("button", { name: "Goal warning" });
    expect(warning).toHaveAccessibleDescription(
      "Couldn't get the goal value. Click to open settings.",
    );

    await userEvent.click(warning);

    expect(onOpenChartSettings).toHaveBeenCalledTimes(1);
    expect(onOpenChartSettings).toHaveBeenCalledWith({
      initialChartSettings: { section: "Display" },
    });
  });

  it("hides the goal warning once the goal value resolves", async () => {
    const { rerenderWithResult } = await setup({
      referencedEntities: createMockFailedReferencedEntitiesResults(),
    });
    expect(
      screen.getByRole("button", { name: "Goal warning" }),
    ).toBeInTheDocument();

    await rerenderWithResult(
      createResult({
        referencedEntities: createMockReferencedEntitiesResults({
          column: "goal",
          value: 250,
        }),
      }),
    );

    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Goal warning" }),
    ).not.toBeInTheDocument();
  });

  it("hides the goal warning when the query fails and the chart goes away", async () => {
    const { rerenderWithResult } = await setup({
      referencedEntities: createMockFailedReferencedEntitiesResults(),
    });
    expect(
      screen.getByRole("button", { name: "Goal warning" }),
    ).toBeInTheDocument();

    await rerenderWithResult(createMockDataset({ error: "Query failed" }));

    expect(screen.queryByText("Jan")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Goal warning" }),
    ).not.toBeInTheDocument();
  });

  it("shows no goal warning when the goal value resolves", async () => {
    await setup({
      referencedEntities: createMockReferencedEntitiesResults({
        column: "goal",
        value: 250,
      }),
    });

    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Goal warning" }),
    ).not.toBeInTheDocument();
  });

  it("shows no goal warning when the chart settings cannot be opened", async () => {
    await setup({
      referencedEntities: createMockFailedReferencedEntitiesResults(),
      canOpenChartSettings: false,
    });

    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Goal warning" }),
    ).not.toBeInTheDocument();
  });

  it("shows the goal warning next to other warnings", async () => {
    await setup({
      referencedEntities: createMockFailedReferencedEntitiesResults(),
      rowsTruncated: 2,
    });

    expect(
      screen.getByRole("button", { name: "Goal warning" }),
    ).toBeInTheDocument();
    expect(getWarningIcons()).toHaveLength(2);
  });
});

function createResult({ referencedEntities, rowsTruncated }: ResultOpts = {}) {
  return createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "month", base_type: "type/Text" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      rows: [
        ["Jan", 1],
        ["Feb", 2],
      ],
      referenced_entities: referencedEntities,
      rows_truncated: rowsTruncated,
    }),
  });
}

// ExplicitSize sets the chart dimensions after mounting
async function waitForChartSize() {
  await act(async () => {
    jest.advanceTimersByTime(0);
  });
}

function getWarningIcons() {
  return screen.getAllByLabelText("warning icon");
}
