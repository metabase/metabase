import userEvent from "@testing-library/user-event";

import { createMockMetadataFromState } from "__support__/metadata";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { act, renderWithProviders, screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { OnOpenChartSettings } from "metabase/visualizations/types";
import { loadVisualizationComponents } from "metabase/viz-core";
import Question from "metabase-lib/v1/Question";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";
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

type SetupOpts = {
  referencedEntities?: DatasetData["referenced_entities"];
  rowsTruncated?: number;
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
  const data = createMockDatasetData({
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
  });

  jest.useFakeTimers({ advanceTimers: true });
  renderWithProviders(
    <QueryVisualization
      question={question}
      result={createMockDataset({ data })}
      rawSeries={[{ card: question.card(), data }]}
      onOpenChartSettings={
        canOpenChartSettings ? onOpenChartSettings : undefined
      }
    />,
  );
  // ExplicitSize sets the chart dimensions after mounting
  await act(async () => {
    jest.advanceTimersByTime(0);
  });

  return { onOpenChartSettings };
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

    expect(onOpenChartSettings).toHaveBeenCalledWith({
      initialChartSettings: { section: "Display" },
    });
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

function getWarningIcons() {
  return screen.getAllByLabelText("warning icon");
}
