import fetchMock from "fetch-mock";

import {
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, waitFor } from "__support__/ui";
import { WorktreeProvider } from "metabase/common/worktrees";
import { useNotebookScreenSize } from "metabase/querying/components/NativeQueryEditor/use-notebook-screen-size";
import { createMockState } from "metabase/redux/store/mocks";
import type { WorktreeId } from "metabase-types/api";

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
    isMetabotSidebarOpen: boolean,
    worktreeId?: WorktreeId,
  ) => {
    const setIsNativeEditorOpen = jest.fn();

    setupCollectionsEndpoints({
      collections: [],
    });
    setupNativeQuerySnippetEndpoints();

    useNotebookScreenSizeMock.mockReturnValue(screenSize);

    const editor = (
      <NativeQueryEditor
        availableHeight={700}
        isNativeEditorOpen={false}
        question={mockQuestion}
        // Unjustified type cast. FIXME
        query={null as any}
        setDatasetQuery={jest.fn()}
        setIsNativeEditorOpen={setIsNativeEditorOpen}
        isInitiallyOpen={false}
      />
    );

    renderWithProviders(
      worktreeId !== undefined ? (
        <WorktreeProvider worktreeId={worktreeId}>{editor}</WorktreeProvider>
      ) : (
        editor
      ),
      {
        // Unjustified type cast. FIXME
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

  describe("worktree scoping", () => {
    const waitForListCalls = async () => {
      await waitFor(() => {
        expect(
          fetchMock.callHistory.lastCall("path:/api/native-query-snippet"),
        ).toBeTruthy();
      });
      await waitFor(() => {
        expect(
          fetchMock.callHistory.lastCall("path:/api/collection"),
        ).toBeTruthy();
      });
    };

    it("requests snippets and snippet collections scoped to the worktree", async () => {
      createEditor("large", false, 7);
      await waitForListCalls();

      expect(
        fetchMock.callHistory.lastCall("path:/api/native-query-snippet")?.url,
      ).toContain("worktree-id=7");
      expect(
        fetchMock.callHistory.lastCall("path:/api/collection")?.url,
      ).toContain("worktree-id=7");
    });

    it("requests unscoped snippets and snippet collections outside a worktree", async () => {
      createEditor("large", false);
      await waitForListCalls();

      expect(
        fetchMock.callHistory.lastCall("path:/api/native-query-snippet")?.url,
      ).not.toContain("worktree-id");
      expect(
        fetchMock.callHistory.lastCall("path:/api/collection")?.url,
      ).not.toContain("worktree-id");
    });
  });
});
