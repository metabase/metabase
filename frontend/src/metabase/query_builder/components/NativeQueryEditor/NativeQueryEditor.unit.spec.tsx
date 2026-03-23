import {
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { useNotebookScreenSize } from "metabase/query_builder/hooks/use-notebook-screen-size";
import { createMockState } from "metabase-types/store/mocks";

import { NativeQueryEditor } from "./NativeQueryEditor";

jest.mock("metabase/query_builder/hooks/use-notebook-screen-size", () => ({
  useNotebookScreenSize: jest.fn(),
}));

type UseNotebookScreenSize = ReturnType<typeof useNotebookScreenSize>;

const useNotebookScreenSizeMock = useNotebookScreenSize as jest.MockedFunction<
  () => UseNotebookScreenSize
>;

const mockQuestion = {
  isSaved: () => false,
} as any;

describe("NativeQueryEditor", () => {
  const createEditor = (
    screenSize: Exclude<UseNotebookScreenSize, undefined>,
    isMetabotSidebarOpen: boolean,
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
        isNativeEditorOpen={false}
        question={mockQuestion}
        query={null as any}
        setDatasetQuery={jest.fn()}
        setIsNativeEditorOpen={setIsNativeEditorOpen}
        isInitiallyOpen={false}
        hasTopBar={false}
      />,
      {
        storeInitialState: createMockState({
          metabot: {
            conversations: {
              omnibot: {
                visible: isMetabotSidebarOpen,
              },
            },
          },
        } as any),
      },
    );

    return setIsNativeEditorOpen;
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    useNotebookScreenSizeMock.mockReset();
  });

  it("should not open data reference when metabot sidebar is open", () => {
    const setIsNativeEditorOpen = createEditor("large", true);

    expect(setIsNativeEditorOpen).toHaveBeenCalledWith(false, false);
  });

  it("should not open data reference on small screens", () => {
    const setIsNativeEditorOpen = createEditor("small", false);

    expect(setIsNativeEditorOpen).toHaveBeenCalledWith(false, false);
  });

  it("should open data reference when metabot is closed", () => {
    const setIsNativeEditorOpen = createEditor("large", false);

    expect(setIsNativeEditorOpen).toHaveBeenCalledWith(false, true);
  });
});
