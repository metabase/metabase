import type { ChainedCommands, Editor } from "@tiptap/core";
import { type EditorState, NodeSelection } from "@tiptap/pm/state";

import type { ConnectorToken } from "../model";

import { connectorContent } from "./nodes/nodes";
import { isConnectorNode } from "./nodes/types";

export type InsertProps = {
  chain: () => ChainedCommands;
  state: EditorState;
  from: number;
  to: number;
};

export const insertConnector = (
  { chain, state, from, to }: InsertProps,
  type: ConnectorToken["type"],
) => {
  const before = state.doc.resolve(from).nodeBefore;
  if (isConnectorNode(before)) {
    const beforePos = from - before.nodeSize;
    return chain()
      .deleteRange({ from, to })
      .command(({ tr: transaction }) => {
        transaction.setNodeMarkup(beforePos, state.schema.nodes[type]);
        return true;
      })
      .setTextSelection(from)
      .run();
  }
  const connector = state.schema.nodeFromJSON(connectorContent(type));
  return chain()
    .deleteRange({ from, to })
    .insertContentAt(from, connector)
    .setTextSelection(from + connector.nodeSize)
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
