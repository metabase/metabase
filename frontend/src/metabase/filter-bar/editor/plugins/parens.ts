import { Extension, InputRule } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";

import type { InsertProps } from "../commands";
import { findDraftAt } from "../draft/read";
import { parenContent } from "../nodes/nodes";
import { isCloseNode, isOpenNode, isPillNode } from "../nodes/types";

const isOperandStart = (node: PmNode | null | undefined) =>
  isPillNode(node) || isOpenNode(node);

const insertOpenParen = ({ chain, state, from, to }: InsertProps) => {
  const next = state.doc.resolve(to).nodeAfter;
  const close = isOperandStart(next) ? [] : [parenContent("close")];
  return chain()
    .deleteRange({ from, to })
    .insertContentAt(from, [parenContent("open"), ...close])
    .setTextSelection(from + 1)
    .run();
};

const insertCloseParen = ({ chain, state, from, to }: InsertProps) => {
  const hasClose = isCloseNode(state.doc.resolve(to).nodeAfter);
  const removed = chain().deleteRange({ from, to });
  const inserted = hasClose
    ? removed
    : removed.insertContentAt(from, parenContent("close"));
  return inserted.setTextSelection(from + 1).run();
};

const createOpenParenRule = () =>
  new InputRule({
    find: /\($/,
    handler: ({ state, range, chain }) => {
      if (findDraftAt(state.selection.$from)) {
        return null;
      }
      insertOpenParen({ chain, state, ...range });
    },
  });

const createCloseParenRule = () =>
  new InputRule({
    find: /\)$/,
    handler: ({ state, range, chain }) => {
      if (findDraftAt(state.selection.$from)) {
        return null;
      }
      insertCloseParen({ chain, state, ...range });
    },
  });

export const createParens = () =>
  Extension.create({
    name: "parens",
    priority: 1000,
    addInputRules: () => [createOpenParenRule(), createCloseParenRule()],
  });
