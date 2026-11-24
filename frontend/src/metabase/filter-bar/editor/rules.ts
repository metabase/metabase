import { type Editor, Extension, InputRule } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

import {
  connectorContent,
  isAndNode,
  isCloseNode,
  isConnectorNode,
  isOpenNode,
  isPillNode,
  isThenNode,
  parenContent,
} from "./nodes";

const isOperandStart = (node: PmNode | null | undefined) =>
  isPillNode(node) || isOpenNode(node);

const removeNodeNextToCaret = (editor: Editor, isBackward: boolean) => {
  const { selection } = editor.state;
  const node = isBackward
    ? selection.$from.nodeBefore
    : selection.$from.nodeAfter;
  if (!selection.empty || !node || node.isText) {
    return false;
  }
  const from = isBackward ? selection.from - node.nodeSize : selection.from;
  const to = from + node.nodeSize;
  if (isThenNode(node)) {
    return editor.commands.setTextSelection(isBackward ? from : to);
  }
  const { doc } = editor.state;
  const before = doc.resolve(from).nodeBefore;
  const after = doc.resolve(to).nodeAfter;
  const isEmptyGroupOpen = isOpenNode(node) && isCloseNode(after);
  const isEmptyGroupClose = isCloseNode(node) && isOpenNode(before);
  return editor.commands.deleteRange({
    from: isEmptyGroupClose ? from - (before?.nodeSize ?? 0) : from,
    to: isEmptyGroupOpen ? to + (after?.nodeSize ?? 0) : to,
  });
};

const moveCaretToStart = (editor: Editor) =>
  editor.commands.setTextSelection(1);

const moveCaretToEnd = (editor: Editor) =>
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);

const toggleConnector = (editor: Editor) => {
  const { selection } = editor.state;
  const isConnector =
    selection instanceof NodeSelection && isConnectorNode(selection.node);
  if (!isConnector) {
    return false;
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
  return true;
};

const createConnectorRule = () =>
  new InputRule({
    find: /(?<![a-z])(and|or)\s$/i,
    handler: ({ state, range, match, chain }) => {
      const type = match[1].toLowerCase() === "or" ? "or" : "and";
      const before = state.doc.resolve(range.from).nodeBefore;
      if (isConnectorNode(before)) {
        const beforePos = range.from - before.nodeSize;
        chain()
          .deleteRange(range)
          .command(({ tr: transaction }) => {
            transaction.setNodeMarkup(beforePos, state.schema.nodes[type]);
            return true;
          })
          .run();
        return;
      }
      chain()
        .deleteRange(range)
        .insertContentAt(range.from, connectorContent(type))
        .run();
    },
  });

const createOpenParenRule = () =>
  new InputRule({
    find: /\($/,
    handler: ({ state, range, chain }) => {
      const next = state.doc.resolve(range.to).nodeAfter;
      const close = isOperandStart(next) ? [] : [parenContent("close")];
      chain()
        .deleteRange(range)
        .insertContentAt(range.from, [parenContent("open"), ...close])
        .setTextSelection(range.from + 1)
        .run();
    },
  });

const createCloseParenRule = () =>
  new InputRule({
    find: /\)$/,
    handler: ({ state, range, chain }) => {
      const next = state.doc.resolve(range.to).nodeAfter;
      if (isCloseNode(next)) {
        chain()
          .deleteRange(range)
          .setTextSelection(range.from + 1)
          .run();
        return;
      }
      chain()
        .deleteRange(range)
        .insertContentAt(range.from, parenContent("close"))
        .run();
    },
  });

export const createFilterBarRules = () =>
  Extension.create({
    name: "filterBarRules",
    priority: 1000,
    addKeyboardShortcuts: () => ({
      Backspace: ({ editor }) => removeNodeNextToCaret(editor, true),
      Delete: ({ editor }) => removeNodeNextToCaret(editor, false),
      Enter: ({ editor }) => toggleConnector(editor),
      Home: ({ editor }) => moveCaretToStart(editor),
      End: ({ editor }) => moveCaretToEnd(editor),
      "Meta-ArrowLeft": ({ editor }) => moveCaretToStart(editor),
      "Meta-ArrowRight": ({ editor }) => moveCaretToEnd(editor),
    }),
    addInputRules: () => [
      createConnectorRule(),
      createOpenParenRule(),
      createCloseParenRule(),
    ],
  });
