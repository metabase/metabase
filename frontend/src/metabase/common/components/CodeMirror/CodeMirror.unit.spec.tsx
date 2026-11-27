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
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";

import { defer } from "metabase/utils/promise";

import { CodeMirror, type CodeMirrorProps } from "./CodeMirror";

type SetupOpts = Pick<CodeMirrorProps, "indentWithTab" | "tabMovesFocus">;

async function setup({ indentWithTab, tabMovesFocus }: SetupOpts = {}) {
  const created = defer<EditorView>();
  render(
    <>
      <button>Previous</button>
      <CodeMirror
        value="value"
        autoFocus
        indentWithTab={indentWithTab}
        tabMovesFocus={tabMovesFocus}
        onCreateEditor={created.resolve}
      />
      <button>Next</button>
    </>,
  );
  return { view: await created.promise };
}

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
  it("keeps custom Tab indentation and backward focus when built-in bindings are disabled", async () => {
    const { view } = await setup({ indentWithTab: false });
    await userEvent.tab();
    expect(view.state.doc.toString()).toBe("  value");
    expect(view.hasFocus).toBe(true);
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Previous" })).toHaveFocus();
  });

  it("moves focus with Tab when navigation is enabled", async () => {
    const { view } = await setup({ tabMovesFocus: true });
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    expect(view.state.doc.toString()).toBe("value");
  });

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
