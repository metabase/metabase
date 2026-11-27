import { type Editor, Extension, InputRule, type Range } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, type Transaction } from "@tiptap/pm/state";

import { PAREN_TEXT } from "../../../model";
import { insertBoolOp } from "../../commands";
import { getStageAt } from "../../document";
import { getEditedPill, pillContent } from "../../nodes/nodes";
import { draftContent, insertDraft } from "../layout";
import {
  findDraftAt,
  findDrafts,
  getDraftRange,
  hasParts,
  isEmptyDraft,
} from "../read";

export const removeDraft = (
  transaction: Transaction,
  draft: PmNode,
  range: Range,
) => {
  const pill = getEditedPill(draft);
  return pill
    ? transaction.replaceWith(
        range.from,
        range.to,
        transaction.doc.type.schema.nodeFromJSON(pillContent(pill)),
      )
    : transaction.delete(range.from, range.to);
};

const createBoolOpRule = () =>
  new InputRule({
    find: /^(and|or) $/i,
    handler: ({ state, chain, match }) => {
      const draft = findDraftAt(state.selection.$from);
      if (!draft || hasParts(draft.node)) {
        return null;
      }
      const type = match[1].toLowerCase() === "or" ? "or" : "and";
      insertBoolOp({ chain, state, range: getDraftRange(draft) }, type);
    },
  });

const createTyping = (editor: Editor) =>
  new Plugin({
    props: {
      handleTextInput: (view, from, to, text) => {
        if (findDraftAt(view.state.selection.$from)) {
          return false;
        }
        const isParen = Object.values(PAREN_TEXT).includes(text);
        if (isParen) {
          return false;
        }
        if (text.trim() === "") {
          return true;
        }
        return insertDraft(
          editor,
          { from, to },
          draftContent(text),
          getStageAt(editor.state.doc, from),
        );
      },
    },
  });

const removeLeftDrafts = (transaction: Transaction) => {
  const caretDraft = findDraftAt(transaction.selection.$from);
  const drafts = findDrafts(transaction.doc).filter(
    ({ node, pos }) => pos !== caretDraft?.pos || isEmptyDraft(node),
  );
  drafts.reverse().forEach((draft) => {
    const range = getDraftRange(draft);
    if (isEmptyDraft(draft.node)) {
      transaction.delete(range.from, range.to);
    } else {
      removeDraft(transaction, draft.node, range);
    }
  });
  return drafts.length > 0 ? transaction : null;
};

/**
 * A Draft is the filter being typed: text in the Bar, framed. It lives while the
 * caret is in it: leaving it or emptying it removes it.
 */
export const createDraftLifecycle = () =>
  Extension.create({
    name: "draftLifecycle",
    priority: 1100,
    addInputRules: () => [createBoolOpRule()],
    addProseMirrorPlugins() {
      return [
        createTyping(this.editor),
        new Plugin({
          appendTransaction: (transactions, _, state) => {
            const isChanged = transactions.some(
              ({ docChanged, selectionSet }) => docChanged || selectionSet,
            );
            return isChanged ? removeLeftDrafts(state.tr) : null;
          },
        }),
      ];
    },
  });
