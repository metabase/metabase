import { clamp } from "@mantine/hooks";
import { Extension } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

const placeCaretFromBlank = (view: EditorView, event: MouseEvent) => {
  const line = view.dom.firstElementChild;
  const isBlank = event.target === view.dom || event.target === line;
  if (!isBlank || !line) {
    return false;
  }
  const rect = line.getBoundingClientRect();
  const result = view.posAtCoords({
    left: clamp(event.clientX, rect.left, rect.right),
    top: clamp(event.clientY, rect.top + 1, rect.bottom - 1),
  });
  if (!result) {
    return false;
  }
  event.preventDefault();
  view.focus();
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, result.pos),
    ),
  );
  return true;
};

const createBlankClickPlugin = () =>
  new Plugin({
    props: {
      handleDOMEvents: {
        mousedown: placeCaretFromBlank,
      },
    },
  });

export const createBlankClick = () =>
  Extension.create({
    name: "blankClick",
    addProseMirrorPlugins: () => [createBlankClickPlugin()],
  });
