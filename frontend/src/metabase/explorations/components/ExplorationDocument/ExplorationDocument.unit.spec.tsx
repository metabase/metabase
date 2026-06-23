import type { JSONContent } from "@tiptap/core";
import type { Route } from "react-router";

import { setupCommentEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Editor } from "metabase/documents/components/Editor";
import { useDocumentEditor } from "metabase/documents/hooks/use-document-editor";
import { createMockDocument } from "metabase-types/api/mocks";

import {
  ExplorationDocument,
  type ExplorationDocumentWithIsAiSummary,
} from "./ExplorationDocument";

jest.mock("metabase/documents/hooks/use-document-editor", () => ({
  useDocumentEditor: jest.fn(),
}));

jest.mock("metabase/documents/components/Editor", () => ({
  Editor: jest.fn(() => <div data-testid="exploration-document-editor" />),
}));

jest.mock("metabase/common/components/LeaveConfirmModal", () => ({
  LeaveRouteConfirmModal: () => null,
}));

const MockEditor = jest.mocked(Editor);

const mockDocument: ExplorationDocumentWithIsAiSummary = {
  id: 1,
  exploration_thread_id: 1,
  name: "Test document",
  creator_id: 1,
  content_type: "application/json+vnd.prose-mirror",
  isAiSummary: false,
  isCanceled: false,
};

const mockDocumentContent: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Hello" }],
    },
  ],
};

const loadedEditorState = {
  canWrite: true,
  isSaving: false,
  documentData: createMockDocument(),
  documentContent: mockDocumentContent,
};

function setupLoadedDocument(
  documentOverrides: Partial<ExplorationDocumentWithIsAiSummary> = {},
  editorState: Partial<ReturnType<typeof useDocumentEditor>> = {},
): void {
  setup({ ...loadedEditorState, ...editorState }, documentOverrides);
}

function setup(
  editorState: Partial<ReturnType<typeof useDocumentEditor>> = {},
  documentOverrides: Partial<ExplorationDocumentWithIsAiSummary> = {},
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
      document={{ ...mockDocument, ...documentOverrides }}
      isCommentsSidebarOpen={false}
      route={{} as Route}
      locationSearch="?timeline=1"
    />,
  );
}

describe("ExplorationDocument", () => {
  beforeEach(() => {
    MockEditor.mockClear();
    setupCommentEndpoints([], {
      target_type: "document",
      target_id: createMockDocument().id,
    });
  });

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

  it("passes editable=false to Editor when the document is an AI summary", () => {
    setupLoadedDocument({ isAiSummary: true });

    expect(MockEditor.mock.calls[0][0]).toEqual(
      expect.objectContaining({ editable: false }),
    );
  });

  it("passes editable=true to Editor when the document is not an AI summary", () => {
    setupLoadedDocument({ isAiSummary: false });

    expect(MockEditor.mock.calls[0][0]).toEqual(
      expect.objectContaining({ editable: true }),
    );
  });

  it("passes canceled AI summary content to Editor when the document is canceled", () => {
    setupLoadedDocument({ isCanceled: true });

    expect(MockEditor.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        initialContent: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "AI Summary generation was stopped.",
                  marks: [{ type: "italic" }],
                },
              ],
            },
          ],
        },
      }),
    );
  });
});
