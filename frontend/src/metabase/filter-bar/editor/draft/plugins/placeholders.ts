import { Extension } from "@tiptap/core";
import { type EditorState, Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { match } from "ts-pattern";
import { t } from "ttag";

import { findDraftAt, getInputs, getValueKind, readDraft } from "../read";
import type { Draft } from "../types";

const getPlaceholders = (draft: Draft): (string | null)[] => {
  const { step, edited, valuesPart } = readDraft(draft);
  if (edited?.type === "column") {
    return [edited.column.label];
  }
  if (edited?.type === "operator") {
    return [edited.operator.label];
  }
  if (step !== "value") {
    return [];
  }
  return match(getValueKind(draft))
    .with("range", () => [t`Min`, t`Max`])
    .with("multi", () => [valuesPart ? t`Add more` : t`Value`])
    .with("single", () => [t`Value`])
    .otherwise(() => []);
};

const showPlaceholders = (state: EditorState) => {
  const draft = findDraftAt(state.selection.$from);
  if (!draft) {
    return DecorationSet.empty;
  }
  const placeholders = getPlaceholders(draft);
  const decorations = getInputs(draft).flatMap((input, index) => {
    const placeholder = placeholders[index];
    const isEmpty = input.node.content.size === 0;
    return isEmpty && placeholder
      ? [
          Decoration.node(input.from - 1, input.to + 1, {
            "data-placeholder": placeholder,
          }),
        ]
      : [];
  });
  return DecorationSet.create(state.doc, decorations);
};

export const createDraftPlaceholders = () =>
  Extension.create({
    name: "draftPlaceholders",
    addProseMirrorPlugins: () => [
      new Plugin({
        props: { decorations: showPlaceholders },
      }),
    ],
  });
