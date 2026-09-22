import {
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { useNotebookScreenSize } from "metabase/querying/components/NativeQueryEditor/use-notebook-screen-size";

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

// Unjustified type cast. FIXME
const mockQuestion = {
  isSaved: () => false,
} as any;

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
        question={mockQuestion}
        // Unjustified type cast. FIXME
        query={null as any}
        setDatasetQuery={jest.fn()}
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
