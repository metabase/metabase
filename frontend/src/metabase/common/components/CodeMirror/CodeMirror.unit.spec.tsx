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
});
