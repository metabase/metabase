import { createMockMetadataFromState } from "__support__/metadata";
import { setupNativeDatasetEndpoint } from "__support__/server-mocks";
import { setupCardDashboardsEndpoint } from "__support__/server-mocks/card";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Database } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { NotebookContainer } from "./NotebookContainer";

// The notebook editor itself is out of scope here
jest.mock("metabase/querying/notebook/components/Notebook", () => ({
  Notebook: () => <div data-testid="notebook" />,
}));

const CARD = createMockCard({
  id: 1,
  name: "Question views last week",
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
});

interface SetupOpts {
  database: Database;
}

const setup = ({ database }: SetupOpts) => {
  setupNativeDatasetEndpoint();
  setupCardDashboardsEndpoint(CARD.id, []);

  const state = createMockState({
    qb: createMockQueryBuilderState({
      card: CARD,
      uiControls: createMockQueryBuilderUIControlsState({
        queryBuilderMode: "notebook",
        // left open from a previous question
        isShowingNotebookNativePreview: true,
      }),
    }),
    entities: createMockEntitiesState({
      databases: [database],
      questions: [CARD],
    }),
  });
  const question = new Question(CARD, createMockMetadataFromState(state));

  renderWithProviders(
    <NotebookContainer
      isOpen
      question={question}
      isDirty={false}
      isRunnable
      isResultDirty={false}
      reportTimezone="UTC"
      readOnly={false}
      updateQuestion={jest.fn()}
      runQuestionQuery={jest.fn()}
      setQueryBuilderMode={jest.fn()}
    />,
    { storeInitialState: state },
  );
};

describe("NotebookContainer", () => {
  it("shows the native query preview sidebar when it is open and the user can write native queries", async () => {
    setup({ database: createSampleDatabase() });

    expect(screen.getByTestId("notebook")).toBeInTheDocument();
    expect(
      await screen.findByTestId("native-query-preview-sidebar"),
    ).toBeInTheDocument();
  });

  it("does not show the native query preview sidebar without native write permissions, like on the instance analytics database (metabase#49904)", () => {
    setup({ database: createSampleDatabase({ native_permissions: "none" }) });

    expect(screen.getByTestId("notebook")).toBeInTheDocument();
    expect(
      screen.queryByTestId("native-query-preview-sidebar"),
    ).not.toBeInTheDocument();
  });
});
