import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { useNotebookScreenSize } from "metabase/query_builder/hooks/use-notebook-screen-size";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
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
  beforeAll(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({
        metabot_v3: true,
      }),
    });

    setupEnterpriseOnlyPlugin("metabot");
  });

  const createEditor = (
    screenSize: Exclude<UseNotebookScreenSize, undefined>,
    isMetabotSidebarOpen: boolean,
  ) => {
    const setIsNativeEditorOpen = jest.fn();

    const metabotState = {
      conversations: {
        omnibot: {
          visible: isMetabotSidebarOpen,
        },
      },
    };

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
          plugins: {
            metabotPlugin: metabotState,
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
