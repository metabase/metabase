import type { ChainedCommands, Editor } from "@tiptap/core";
import { type EditorState, NodeSelection } from "@tiptap/pm/state";

import { type BoolOpToken, boolOpToken } from "../model";

import { connectorContent } from "./nodes/nodes";
import { isBoolOpNode } from "./nodes/types";

export type InsertProps = {
  chain: () => ChainedCommands;
  state: EditorState;
  from: number;
  to: number;
};

export const insertBoolOp = (
  { chain, state, from, to }: InsertProps,
  type: BoolOpToken["type"],
) => {
  const before = state.doc.resolve(from).nodeBefore;
  if (isBoolOpNode(before)) {
    const beforePos = from - before.nodeSize;
    return chain()
      .deleteRange({ from, to })
      .command(({ tr: transaction }) => {
        transaction.setNodeAttribute(beforePos, "token", boolOpToken(type));
        return true;
      })
      .setTextSelection(from)
      .run();
  }
  const boolOp = state.schema.nodeFromJSON(connectorContent(boolOpToken(type)));
  return chain()
    .deleteRange({ from, to })
    .insertContentAt(from, boolOp)
    .setTextSelection(from + boolOp.nodeSize)
    .run();
};

export const moveCaretPast = (
  editor: Editor,
  pos: number,
  isBackward: boolean,
) => {
  const $pos = editor.state.doc.resolve(pos);
  const node = isBackward ? $pos.nodeBefore : $pos.nodeAfter;
  if (!node) {
    return editor.commands.setTextSelection(pos);
  }
  const nodePos = isBackward ? pos - node.nodeSize : pos;
  if (NodeSelection.isSelectable(node)) {
    return editor.commands.setNodeSelection(nodePos);
  }
  return editor.commands.setTextSelection(
    isBackward ? nodePos : nodePos + node.nodeSize,
  );
};
