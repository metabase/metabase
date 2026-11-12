import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCommentEndpoints,
  setupDocumentEndpoints,
  setupTimelinesEndpoints,
  setupUpdateDocumentErrorEndpoint,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockDocument,
  createMockDocumentContent,
} from "metabase-types/api/mocks";

import { DocumentPage } from "./DocumentPage";

const setup = () => {
  setupBookmarksEndpoints([]);
  setupDocumentEndpoints(
    createMockDocument({
      name: "Ends with whitespace ",
      id: 1,
      can_write: true,
      document: createMockDocumentContent({
        content: [
          {
            type: "paragraph",
            attrs: { _id: "1" },
            content: [{ type: "text", text: "Original content" }],
          },
        ],
      }),
    }),
  );
  setupCommentEndpoints([], { target_type: "document", target_id: 1 });
  setupTimelinesEndpoints([]);

  return renderWithProviders(
    <>
      <Route path="/document/:entityId" element={<DocumentPage />}></Route>
    </>,
    {
      withRouter: true,
      initialRoute: "/document/1",
    },
  );
};

const setupNewDocument = () => {
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);

  return renderWithProviders(
    <Route path="/document/:entityId" element={<DocumentPage />} />,
    {
      withRouter: true,
      initialRoute: "/document/new",
    },
  );
};

const getDocumentTitle = async () =>
  await screen.findByRole("textbox", { name: /document title/i });

describe("Document Page", () => {
  it("should show a save button when title changes", async () => {
    setup();
    await waitFor(async () =>
      expect(await getDocumentTitle()).toHaveValue("Ends with whitespace "),
    );

    await userEvent.clear(await getDocumentTitle());
    await userEvent.type(await getDocumentTitle(), "New Title");

    expect(
      await screen.findByRole("button", { name: "Save" }),
    ).toBeInTheDocument();

    // Change the title back to the old value, the save button should disappear.
    // I don't love how this test works, but asserting that something doesn't exist
    // is a very easy way to get false positives in your test. Asserting that something
    // doesn't exist *anymore* should be more robust
    await userEvent.clear(await getDocumentTitle());
    await userEvent.type(await getDocumentTitle(), "Ends with whitespace ");

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows an error toast and keeps the save button when saving fails", async () => {
    const { store } = setup();
    setupUpdateDocumentErrorEndpoint(1, { status: 500 });

    await getDocumentTitle();
    await screen.findByText("Original content");
    // A body edit sets the unsaved-changes flag. A title edit does not, so it
    // keeps the Save button visible whatever the save handler does.
    // Tiptap attaches its editor instance to the contenteditable element.
    const editorElement = screen
      .getAllByRole("textbox")
      .find((element) => "editor" in element) as HTMLElement & {
      editor: Editor;
    };
    act(() => {
      editorElement.editor.commands.insertContentAt(
        editorElement.editor.state.doc.content.size - 1,
        " edited",
      );
    });
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(store.getState().undo).toEqual([
        expect.objectContaining({
          message: "Error saving document",
          icon: "warning",
        }),
      ]),
    );
    expect(
      fetchMock.callHistory.calls("path:/api/document/1", { method: "PUT" }),
    ).toHaveLength(1);
    // The Save button fades out over 200ms and stays mounted during the fade.
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("warns about unsaved changes only once a navigation lands back on /document/new", async () => {
    const { router } = setupNewDocument();

    await userEvent.type(await getDocumentTitle(), "Draft");

    expect(screen.queryByTestId("leave-confirmation")).not.toBeInTheDocument();

    // The "New document" menu item links to the URL we are already on, which v7
    // resolves as a replace. The page stays mounted, so the fresh location is
    // what tells it the user asked to start over.
    act(() => router?.navigate("/document/new", { replace: true }));

    expect(await screen.findByTestId("leave-confirmation")).toBeInTheDocument();
  });
});
