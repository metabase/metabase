import { renderHook } from "@testing-library/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Editor } from "@tiptap/react";
import fetchMock from "fetch-mock";

import { act, getTestStoreAndWrapper, waitFor } from "__support__/ui";
import type { DocumentId } from "metabase-types/api";
import { createMockDocument } from "metabase-types/api/mocks";

import { useDocumentEditor } from "./use-document-editor";

const DOCUMENT_ID = 1;
const SAVE_ERROR = { status: 500, data: "" };

// The real mutations' `onQueryStarted` rethrows failed requests as unhandled
// rejections, which Jest reports as test failures, so the save requests are
// stubbed to resolve with an RTK Query error result.
const mockCreateDocument = jest.fn();
const mockUpdateDocument = jest.fn();

jest.mock("metabase/api/document", () => ({
  ...jest.requireActual("metabase/api/document"),
  useCreateDocumentMutation: () => [mockCreateDocument, { isLoading: false }],
  useUpdateDocumentMutation: () => [mockUpdateDocument, { isLoading: false }],
}));

const setup = (documentId: DocumentId | "new") => {
  mockCreateDocument.mockResolvedValue({ error: SAVE_ERROR });
  mockUpdateDocument.mockResolvedValue({ error: SAVE_ERROR });

  const { wrapper, store } = getTestStoreAndWrapper({
    initialRoute: "/",
    withRouter: true,
    withKBar: false,
    withDND: false,
  });

  const { result } = renderHook(() => useDocumentEditor({ documentId }), {
    wrapper,
  });

  const editor = new Editor({ extensions: [Document, Paragraph, Text] });
  act(() => {
    result.current.setEditorInstance(editor);
  });

  const typeInEditor = (text: string) =>
    act(() => {
      editor.commands.insertContent(text);
      result.current.handleChange(editor.getJSON());
    });

  const getToastMessages = () =>
    store.getState().undo.map(({ message }) => message);

  return { result, typeInEditor, getToastMessages };
};

const CONTENT = "Body text";

describe("useDocumentEditor > save errors", () => {
  afterEach(() => {
    jest.clearAllMocks();
    fetchMock.removeRoutes().clearHistory();
  });

  it("shows an error toast and keeps the save button when creating a document fails", async () => {
    const { result, typeInEditor, getToastMessages } = setup("new");
    expect(result.current.showSaveButton).toBe(false);

    typeInEditor(CONTENT);
    expect(result.current.documentTitle).toBe("");
    expect(result.current.showSaveButton).toBe(true);

    const saveResult = await act(() => result.current.handleSave(null));

    expect(mockCreateDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          content: [
            expect.objectContaining({
              content: [{ type: "text", text: CONTENT }],
            }),
          ],
        }),
      }),
    );
    expect(saveResult).toEqual({ error: SAVE_ERROR });
    expect(getToastMessages()).toEqual(["Error saving document"]);
    expect(result.current.showSaveButton).toBe(true);
  });

  it("shows an error toast and keeps the save button when updating a document fails", async () => {
    fetchMock.get(
      `path:/api/document/${DOCUMENT_ID}`,
      createMockDocument({ id: DOCUMENT_ID, name: "Test Document" }),
    );
    const { result, typeInEditor, getToastMessages } = setup(DOCUMENT_ID);

    await waitFor(() =>
      expect(result.current.documentData?.id).toBe(DOCUMENT_ID),
    );
    // The hook captures the loaded editor content as the dirty-check baseline
    // on the next tick.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(result.current.showSaveButton).toBe(false);

    typeInEditor(CONTENT);
    expect(result.current.documentTitle).toBe("Test Document");
    expect(result.current.showSaveButton).toBe(true);

    const saveResult = await act(() => result.current.handleSave());

    expect(mockUpdateDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        id: DOCUMENT_ID,
        name: "Test Document",
        document: expect.objectContaining({
          content: [
            expect.objectContaining({
              content: [{ type: "text", text: CONTENT }],
            }),
          ],
        }),
      }),
    );
    expect(saveResult).toEqual({ error: SAVE_ERROR });
    expect(getToastMessages()).toEqual(["Error saving document"]);
    expect(result.current.showSaveButton).toBe(true);
  });
});
