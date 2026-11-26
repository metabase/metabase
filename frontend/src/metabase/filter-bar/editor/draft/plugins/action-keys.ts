import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import { getPillToken } from "../../nodes/nodes";
import { isPillNode } from "../../nodes/types";
import type { DraftActions } from "../actions";
import { getClickedField, getClickedPart } from "../clicked-field";
import { placeCaretInField } from "../layout";
import { findDraftAt, readDraft } from "../read";

import { finishPartEditAtCaret } from "./keys";

export const createDraftActionKeys = <F>(actions: DraftActions<F>) =>
  Extension.create({
    name: "draftActionKeys",
    priority: 1160,
    addKeyboardShortcuts: () => ({
      Enter: ({ editor }) => {
        const draft = findDraftAt(editor.state.selection.$from);
        const isValueStep = draft && readDraft(draft).step === "value";
        return isValueStep
          ? actions.commitDraft(editor, draft)
          : actions.editSelectedPill(editor);
      },
      ArrowDown: ({ editor }) => actions.editSelectedPill(editor),
      Escape: ({ editor }) => finishPartEditAtCaret(editor),
      Backspace: ({ editor }) => actions.removeLastValue(editor),
      ",": ({ editor }) => actions.addTypedValues(editor),
      Tab: ({ editor }) => actions.tabInValues(editor),
    }),
    addProseMirrorPlugins() {
      const { editor } = this;
      return [
        new Plugin({
          props: {
            handleClickOn: (_, __, node, nodePos, event) => {
              const token = isPillNode(node) ? getPillToken<F>(node) : null;
              const isOpaque = token !== null && token.content.type !== "parts";
              const part = getClickedPart(event);
              const isPartClick = token !== null && part !== null;
              if (!isOpaque && !isPartClick) {
                return false;
              }
              const field = getClickedField(event);
              actions.editPill(editor, nodePos, part ?? "value");
              if (field !== null) {
                placeCaretInField(editor, field);
              }
              return true;
            },
          },
        }),
      ];
    },
  });
