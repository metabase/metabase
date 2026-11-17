import { createMockMetadataFromState } from "__support__/metadata";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { QueryVisualization } from "./QueryVisualization";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});
const metadata = createMockMetadataFromState(state);

interface SetupOpts {
  isRunning: boolean;
  isResultDirty: boolean;
}

const setup = ({ isRunning, isResultDirty }: SetupOpts) => {
  const question = new Question(
    {
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      display: "table",
      visualization_settings: {},
    },
    metadata,
  );

  renderWithProviders(
    <QueryVisualization
      question={question}
      isRunning={isRunning}
      isRunnable
      isResultDirty={isResultDirty}
    />,
    { storeInitialState: state },
  );
};

describe("QueryVisualization", () => {
  it("should show a run button before the query is ran", async () => {
    setup({ isRunning: false, isResultDirty: true });

    const runButton = screen.getByTestId("run-button");
    expect(runButton).toBeVisible();
    expect(runButton).not.toHaveAttribute("aria-hidden", "true");

    expect(screen.queryByText("Doing science...")).not.toBeInTheDocument();
  });

  it("should show the loading message while the query runs", async () => {
    setup({ isRunning: true, isResultDirty: false });

    expect(await screen.findByText("Doing science...")).toBeInTheDocument();
    expect(screen.getByTestId("run-button")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("should not show the loading message or run button once loaded", async () => {
    setup({ isRunning: false, isResultDirty: false });

    expect(screen.queryByText("Doing science...")).not.toBeInTheDocument();
    expect(screen.getByTestId("run-button")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
