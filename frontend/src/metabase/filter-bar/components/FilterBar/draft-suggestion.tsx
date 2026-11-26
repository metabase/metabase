import { type Editor, Extension, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { match } from "ts-pattern";

import { createBareSuggestionRenderer } from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";

import {
  DRAFT_SUGGESTION_KEY,
  type DraftActions,
  findPartStep,
  getStageAt,
  insertConnector,
} from "../../editor";
import type { FilterBarAdapter } from "../../types";
import { type DraftPick, createDraftPopup } from "../DraftPopup/DraftPopup";

type DraftSuggestionOptions<F> = {
  getAdapter: () => FilterBarAdapter<F>;
  actions: DraftActions<F>;
};

export const createDraftSuggestion = <F,>({
  getAdapter,
  actions,
}: DraftSuggestionOptions<F>) => {
  const pick = (editor: Editor, range: Range, item: DraftPick<F>) => {
    const stage = getStageAt(editor.state.doc, range.from);
    match(item)
      .with({ type: "column" }, ({ column, stage: columnStage }) =>
        actions.pickColumn(editor, range, column, columnStage ?? stage),
      )
      .with({ type: "filter" }, ({ filter }) =>
        actions.commitFilter(editor, range, filter, stage),
      )
      .with({ type: "operator" }, ({ operator }) =>
        actions.pickOperator(editor, range, operator),
      )
      .with({ type: "connector" }, ({ connector }) =>
        insertConnector(
          { chain: () => editor.chain(), state: editor.state, ...range },
          connector,
        ),
      )
      .exhaustive();
  };

  return Extension.create({
    name: "draftSuggestion",
    priority: 1150,
    addProseMirrorPlugins() {
      return [
        Suggestion<DraftPick<F>, DraftPick<F>>({
          editor: this.editor,
          pluginKey: DRAFT_SUGGESTION_KEY,
          findSuggestionMatch: ({ $position }) => findPartStep($position),
          shouldShow: ({ editor, transaction }) =>
            editor.isFocused && !transaction.getMeta("focus"),
          shouldResetDismissed: ({ transaction }) => transaction.docChanged,
          command: ({ editor, range, props }) => pick(editor, range, props),
          render: createBareSuggestionRenderer(createDraftPopup(getAdapter)),
        }),
      ];
    },
  });
};
