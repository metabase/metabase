import { type Editor, Extension } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

import { moveCaretPast } from "../commands";
import {
  isAndNode,
  isCloseNode,
  isConnectorNode,
  isOpenNode,
  isThenNode,
} from "../nodes/types";

const getNodeNextToCaret = (editor: Editor, isBackward: boolean) => {
  const { selection } = editor.state;
  const node = isBackward
    ? selection.$from.nodeBefore
    : selection.$from.nodeAfter;
  return selection.empty && node && !node.isText ? node : null;
};

const jumpOverThen = (editor: Editor, isBackward: boolean) =>
  moveCaretPast(editor, editor.state.selection.from, isBackward);

const deleteNextToCaret = (editor: Editor, isBackward: boolean) => {
  const node = getNodeNextToCaret(editor, isBackward);
  if (!node) {
    return false;
  }
  if (isThenNode(node)) {
    return jumpOverThen(editor, isBackward);
  }
  const { doc, selection } = editor.state;
  const from = isBackward ? selection.from - node.nodeSize : selection.from;
  const to = from + node.nodeSize;
  const before = doc.resolve(from).nodeBefore;
  const after = doc.resolve(to).nodeAfter;
  const isEmptyGroupOpen = isOpenNode(node) && isCloseNode(after);
  const isEmptyGroupClose = isCloseNode(node) && isOpenNode(before);
  return editor.commands.deleteRange({
    from: isEmptyGroupClose ? from - (before?.nodeSize ?? 0) : from,
    to: isEmptyGroupOpen ? to + (after?.nodeSize ?? 0) : to,
  });
};

const toggleConnector = (editor: Editor) => {
  const { selection } = editor.state;
  const isConnector =
    selection instanceof NodeSelection && isConnectorNode(selection.node);
  if (!isConnector) {
    return;
  }
  const type = isAndNode(selection.node) ? "or" : "and";
  const { schema } = editor.state;
  const transaction = editor.state.tr.setNodeMarkup(
    selection.from,
    schema.nodes[type],
  );
  editor.view.dispatch(
    transaction.setSelection(
      NodeSelection.create(transaction.doc, selection.from),
    ),
  );
};

export const createFilterBarKeys = () =>
  Extension.create({
    name: "filterBarKeys",
    priority: 1000,
    addKeyboardShortcuts: () => ({
      Backspace: ({ editor }) => deleteNextToCaret(editor, true),
      Delete: ({ editor }) => deleteNextToCaret(editor, false),
      Enter: ({ editor }) => {
        toggleConnector(editor);
        return true;
      },
      Home: ({ editor }) => editor.commands.selectTextblockStart(),
      End: ({ editor }) => editor.commands.selectTextblockEnd(),
      "Meta-ArrowLeft": ({ editor }) => editor.commands.selectTextblockStart(),
      "Meta-ArrowRight": ({ editor }) => editor.commands.selectTextblockEnd(),
    }),
  });
