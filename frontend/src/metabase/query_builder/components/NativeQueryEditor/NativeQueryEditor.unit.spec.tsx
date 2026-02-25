import { renderWithProviders } from "__support__/ui";
import { PLUGIN_METABOT } from "metabase/plugins";
import { useNotebookScreenSize } from "metabase/query_builder/hooks/use-notebook-screen-size";

import { NativeQueryEditor } from "./NativeQueryEditor";

jest.mock("metabase/api", () => {
  const actual = jest.requireActual("metabase/api");

  return {
    ...actual,
    useListCollectionsQuery: jest.fn(() => ({ data: [] })),
    useListSnippetsQuery: jest.fn(() => ({ data: [] })),
  };
});

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

    useNotebookScreenSizeMock.mockReturnValue(screenSize);
    jest
      .spyOn(PLUGIN_METABOT, "getMetabotVisible")
      .mockReturnValue(isMetabotSidebarOpen);

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
