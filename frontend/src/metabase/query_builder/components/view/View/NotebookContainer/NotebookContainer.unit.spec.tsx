import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupNativeDatasetEndpoint,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
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
  windowWidthPx?: number;
}

const ROOT_FONT_SIZE_PX = 16;

// Evaluates `(max-width: Nem)` media queries against the given window width
function mockWindowWidth(windowWidthPx: number) {
  jest.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const maxWidthEm = /max-width:\s*([\d.]+)em/.exec(query)?.[1];
    const matches =
      maxWidthEm != null &&
      windowWidthPx <= Number(maxWidthEm) * ROOT_FONT_SIZE_PX;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
  });
}

const setup = ({ database, windowWidthPx = 1280 }: SetupOpts) => {
  mockWindowWidth(windowWidthPx);
  setupNativeDatasetEndpoint();
  setupNativeQuerySnippetEndpoints();
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
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the native query preview sidebar when it is open and the user can write native queries", async () => {
    setup({ database: createSampleDatabase() });

    expect(screen.getByTestId("notebook")).toBeInTheDocument();
    expect(
      await screen.findByTestId("native-query-preview-sidebar"),
    ).toBeVisible();
  });

  it("does not show the native query preview sidebar without native write permissions, like on the instance analytics database (metabase#49904)", () => {
    setup({ database: createSampleDatabase({ native_permissions: "none" }) });

    expect(screen.getByTestId("notebook")).toBeInTheDocument();
    expect(
      screen.queryByTestId("native-query-preview-sidebar"),
    ).not.toBeInTheDocument();
  });

  it("shows the native query preview at full width on a small screen (metabase#67767)", async () => {
    setup({ database: createSampleDatabase(), windowWidthPx: 630 });

    expect(
      await screen.findByTestId("native-query-preview-sidebar"),
    ).toBeVisible();
    expect(
      screen.queryByTestId("notebook-native-preview-resize-handle"),
    ).not.toBeInTheDocument();
  });

  it("shows the native query preview in a resizable sidebar on a wider screen (metabase#67767)", async () => {
    setup({ database: createSampleDatabase(), windowWidthPx: 700 });

    expect(
      await screen.findByTestId("native-query-preview-sidebar"),
    ).toBeVisible();
    expect(
      screen.getByTestId("notebook-native-preview-resize-handle"),
    ).toBeInTheDocument();
  });
});
