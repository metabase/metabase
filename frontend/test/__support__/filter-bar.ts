import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import type { EditorProps } from "@tiptap/pm/view";

import { act, screen } from "__support__/ui";

export const getEditor = () =>
  screen.getByText(
    (_, element) => element?.getAttribute("contenteditable") === "true",
  );

export const getTiptapEditor = () => {
  const element = getEditor();
  return "editor" in element && element.editor instanceof Editor
    ? element.editor
    : null;
};

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

export const typeText = async (text: string) => {
  act(() => {
    const editor = getTiptapEditor();
    if (!editor) {
      return;
    }
    const { view } = editor;
    const { from, to } = view.state.selection;
    const isHandled = view.someProp(
      "handleTextInput",
      (handle: NonNullable<EditorProps["handleTextInput"]>) =>
        handle(view, from, to, text, () => view.state.tr),
    );
    if (!isHandled) {
      view.dispatch(view.state.tr.insertText(text, from, to));
    }
  });
  await flush();
};

export const focusBar = () => userEvent.click(getEditor());

export const getPillTexts = () =>
  screen.queryAllByTestId("filter-pill").map((pill) => pill.textContent);
