import type { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { useDocumentEditor } from "metabase/documents/hooks/use-document-editor";

import {
  ExplorationDocument,
  type ExplorationDocumentWithIsAiSummary,
} from "./ExplorationDocument";

jest.mock("metabase/documents/hooks/use-document-editor", () => ({
  useDocumentEditor: jest.fn(),
}));

const mockDocument: ExplorationDocumentWithIsAiSummary = {
  id: 1,
  exploration_thread_id: 1,
  name: "Test document",
  creator_id: 1,
  content_type: "application/json+vnd.prose-mirror",
  isAiSummary: false,
};

function setup(
  editorState: Partial<ReturnType<typeof useDocumentEditor>>,
): void {
  jest.mocked(useDocumentEditor).mockReturnValue({
    isDocumentLoading: false,
    error: null,
    documentData: undefined,
    ...editorState,
  } as any);

  renderWithProviders(
    <ExplorationDocument
      explorationId={1}
      document={mockDocument}
      isCommentsSidebarOpen={false}
      route={{} as Route}
    />,
  );
}

describe("ExplorationDocument", () => {
  it("renders a loading skeleton while the document is loading", () => {
    setup({ isDocumentLoading: true });

    expect(
      screen.getByTestId("exploration-document-skeleton"),
    ).toBeInTheDocument();
  });

  it("renders the error state, not the skeleton, when loading fails", () => {
    setup({ isDocumentLoading: false, error: "Something went wrong" });

    expect(
      screen.queryByTestId("exploration-document-skeleton"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
