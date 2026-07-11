import { EditorView } from "@codemirror/view";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type { NativeQuerySnippet } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { CodeMirrorEditor } from "./CodeMirrorEditor";

// The default test suite mocks `@uiw/react-codemirror` with a plain <textarea>
// that drops `onUpdate`. These tests exercise the real editor's update handling
// (cursor tracking over card tags), so we opt back into the real component.
// `jest.unmock` is hoisted above the imports above, so the real module loads.
jest.unmock("@uiw/react-codemirror");

function setup({
  text = "",
  readOnly = false,
  snippets = [],
}: {
  text?: string;
  readOnly?: boolean;
  snippets?: NativeQuerySnippet[];
} = {}) {
  const onChange = jest.fn();
  const onCursorMoveOverCardTag = jest.fn();
  const onRightClickSelection = jest.fn();
  const onSelectionChange = jest.fn();

  setupUserMetabotPermissionsEndpoint();
  fetchMock.get("path:/api/native-query-snippet", {
    body: snippets,
  });

  const database = createSampleDatabase();
  const metadata = createMockMetadata({
    databases: [database],
  });
  const provider = createMetadataProvider({
    databaseId: database.id,
    metadata,
  });

  const query = Lib.createTestNativeQuery(provider, { query: text });

  renderWithProviders(
    <CodeMirrorEditor
      query={query}
      onChange={onChange}
      readOnly={readOnly}
      onCursorMoveOverCardTag={onCursorMoveOverCardTag}
      onRightClickSelection={onRightClickSelection}
      onSelectionChange={onSelectionChange}
    />,
  );

  return {
    onChange,
    onCursorMoveOverCardTag,
    onRightClickSelection,
    onSelectionChange,
  };
}

function getEditorView(): EditorView {
  const content = document.querySelector(".cm-content") as HTMLElement | null;
  const view = content && EditorView.findFromDOM(content);
  if (!view) {
    throw new Error("Could not find the CodeMirror EditorView");
  }
  return view;
}

describe("CodemirrorEditor", () => {
  it("Should render the natie query's text", () => {
    const text = "SELECT 1;";

    setup({ text });
    expect(screen.getByRole("textbox")).toHaveTextContent(text);
  });

  describe("card tag cursor tracking", () => {
    const TEXT = "SELECT * FROM {{#123-reference-question}}";
    // A position inside the `#123` card tag.
    const CARD_TAG_POSITION = TEXT.indexOf("123") + 1;

    it("notifies when the cursor moves onto a card tag", () => {
      const { onCursorMoveOverCardTag } = setup({ text: TEXT });
      const view = getEditorView();

      view.dispatch({ selection: { anchor: CARD_TAG_POSITION } });

      expect(onCursorMoveOverCardTag).toHaveBeenCalledWith(123);
    });

    // Regression test for metabase#54124: closing the data-reference sidebar
    // must stick. Before the fix, any editor update (not just cursor moves)
    // re-notified while the cursor sat over a card tag, re-opening the sidebar.
    it("does not re-notify on updates that leave the cursor in place (metabase#54124)", () => {
      const { onCursorMoveOverCardTag } = setup({ text: TEXT });
      const view = getEditorView();

      // Move the cursor onto the card tag (this legitimately notifies once).
      view.dispatch({ selection: { anchor: CARD_TAG_POSITION } });
      expect(onCursorMoveOverCardTag).toHaveBeenCalledWith(123);
      onCursorMoveOverCardTag.mockClear();

      // A document change that does not move the cursor head (edit at the very
      // end) must not re-notify, even though the cursor is still over the tag.
      view.dispatch({
        changes: { from: view.state.doc.length, insert: " " },
      });

      expect(onCursorMoveOverCardTag).not.toHaveBeenCalled();
    });
  });
});
