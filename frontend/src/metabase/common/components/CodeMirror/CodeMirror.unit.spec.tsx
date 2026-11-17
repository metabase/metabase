jest.unmock("@uiw/react-codemirror");

import {
  SearchQuery,
  findNext,
  openSearchPanel,
  replaceNext,
  searchPanelOpen,
  setSearchQuery,
} from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import { act, render, waitFor } from "@testing-library/react";
import { useMemo, useState } from "react";

import { CodeMirror } from "./CodeMirror";

function SearchReplaceHarness({
  initialValue,
  onEditorReady,
}: {
  initialValue: string;
  onEditorReady: (view: EditorView) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const basicSetup = useMemo(
    () => ({
      lineNumbers: false,
      foldGutter: false,
      highlightActiveLine: false,
      highlightActiveLineGutter: false,
    }),
    [],
  );

  return (
    <CodeMirror
      value={value}
      onChange={setValue}
      basicSetup={basicSetup}
      onCreateEditor={(view) => onEditorReady(view)}
    />
  );
}

describe("CodeMirror", () => {
  it("keeps the find/replace panel open while matches remain and closes after the last replace", async () => {
    const initialValue = "test1, test2, test1, test3";
    let editorView: EditorView | undefined;

    render(
      <SearchReplaceHarness
        initialValue={initialValue}
        onEditorReady={(view) => {
          editorView = view;
        }}
      />,
    );

    await waitFor(() => {
      expect(editorView).toBeDefined();
    });

    openSearchPanel(editorView!);

    editorView!.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: "test1",
          replace: "X",
        }),
      ),
    });

    await act(async () => {
      findNext(editorView!);
      replaceNext(editorView!);
    });

    expect(searchPanelOpen(editorView!.state)).toBe(true);
    expect(editorView!.state.doc.toString()).toBe("X, test2, test1, test3");

    await act(async () => {
      replaceNext(editorView!);
    });

    await waitFor(() => {
      expect(searchPanelOpen(editorView!.state)).toBe(false);
    });
    expect(editorView!.state.doc.toString()).toBe("X, test2, X, test3");
  });

  describe("Tab", () => {
    async function setup({ tabIndents }: { tabIndents?: boolean }) {
      let view: EditorView | undefined;
      render(
        <CodeMirror
          value="value"
          // Like the expression editor, without CodeMirror's own Tab indent.
          indentWithTab={false}
          tabIndents={tabIndents}
          onCreateEditor={(editorView) => {
            view = editorView;
          }}
        />,
      );
      await waitFor(() => expect(view).toBeDefined());
      if (view == null) {
        throw new Error("The editor wasn't created");
      }
      const editorView = view;

      // False when the editor cancelled the browser's own action for Tab.
      const pressTab = () =>
        editorView.contentDOM.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Tab",
            bubbles: true,
            cancelable: true,
          }),
        );
      return { view: editorView, pressTab };
    }

    it("indents by default", async () => {
      const { view, pressTab } = await setup({});
      act(() => {
        pressTab();
      });
      expect(view.state.doc.toString()).not.toBe("value");
    });

    it("leaves the focus to the browser without indenting when tabIndents is false", async () => {
      const { view, pressTab } = await setup({ tabIndents: false });
      let isDefaultAllowed = false;
      act(() => {
        isDefaultAllowed = pressTab();
      });
      expect(isDefaultAllowed).toBe(true);
      expect(view.state.doc.toString()).toBe("value");
    });
  });
});
