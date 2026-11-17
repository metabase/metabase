import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { useNotebookScreenSize } from "metabase/querying/components/NativeQueryEditor/use-notebook-screen-size";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { NativeQueryEditor } from "./NativeQueryEditor";

jest.mock(
  "metabase/querying/components/NativeQueryEditor/use-notebook-screen-size",
  () => ({
    useNotebookScreenSize: jest.fn(),
  }),
);

type UseNotebookScreenSize = ReturnType<typeof useNotebookScreenSize>;

// Unjustified type cast. FIXME
const useNotebookScreenSizeMock = useNotebookScreenSize as jest.MockedFunction<
  () => UseNotebookScreenSize
>;

const METADATA = createMockMetadata({ databases: [createSampleDatabase()] });

const QUESTION = Question.create({ metadata: METADATA }).setQuery(
  Lib.createTestNativeQuery(
    createMetadataProvider({ databaseId: SAMPLE_DB_ID, metadata: METADATA }),
    { query: "SELECT 1" },
  ),
);

describe("NativeQueryEditor", () => {
  const createEditor = (
    screenSize: Exclude<UseNotebookScreenSize, undefined>,
    canAutoOpenDataReference: boolean,
  ) => {
    const setIsNativeEditorOpen = jest.fn();

    setupCollectionsEndpoints({
      collections: [],
    });
    setupNativeQuerySnippetEndpoints();

    useNotebookScreenSizeMock.mockReturnValue(screenSize);

    renderWithProviders(
      <NativeQueryEditor
        availableHeight={700}
        canAutoOpenDataReference={canAutoOpenDataReference}
        isNativeEditorOpen={false}
        question={QUESTION}
        setQuery={jest.fn()}
        setIsNativeEditorOpen={setIsNativeEditorOpen}
        isInitiallyOpen={false}
      />,
    );

    return setIsNativeEditorOpen;
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    useNotebookScreenSizeMock.mockReset();
  });

  it("should not open data reference when canAutoOpenDataReference is false", () => {
    const setIsNativeEditorOpen = createEditor("large", false);

    expect(setIsNativeEditorOpen).toHaveBeenCalledWith(false, false);
  });

  it("should not open data reference on small screens", () => {
    const setIsNativeEditorOpen = createEditor("small", true);

    expect(setIsNativeEditorOpen).toHaveBeenCalledWith(false, false);
  });

  it("should open data reference on large screens", () => {
    const setIsNativeEditorOpen = createEditor("large", true);

    expect(setIsNativeEditorOpen).toHaveBeenCalledWith(false, true);
  });
});
