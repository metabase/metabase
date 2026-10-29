import { createMockMetadataFromState } from "__support__/metadata";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { QueryVisualization } from "./QueryVisualization";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});
const metadata = createMockMetadataFromState(state);

interface SetupOpts {
  isRunning: boolean;
}

const setup = ({ isRunning }: SetupOpts) => {
  const question = new Question(
    {
      dataset_query: {
        type: "query",
        query: { "source-table": ORDERS_ID },
        database: SAMPLE_DB_ID,
      },
      display: "table",
      visualization_settings: {},
    },
    metadata,
  );

  renderWithProviders(
    <QueryVisualization question={question} isRunning={isRunning} />,
    { storeInitialState: state },
  );
};

describe("QueryVisualization", () => {
  it("should show the loading message while the query runs", async () => {
    setup({ isRunning: true });

    expect(await screen.findByText("Doing science...")).toBeInTheDocument();
  });

  it("should not show the loading message when the query does not run", () => {
    setup({ isRunning: false });

    expect(screen.queryByText("Doing science...")).not.toBeInTheDocument();
  });
});
