import { type Editor, Extension, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { match } from "ts-pattern";

import {
  DRAFT_SUGGESTION_KEY,
  type DraftActions,
  findPartStep,
  getStageAt,
  insertBoolOp,
} from "../../editor";
import type { BoolOpToken } from "../../model";
import type { ColumnItem, FilterOperator } from "../../types";
import type { GetAnchorRect } from "../AnchorTarget/AnchorTarget";

export type DraftPick<F> =
  | ColumnItem<F>
  | { type: "operator"; operator: FilterOperator }
  | { type: "boolOp"; boolOp: BoolOpToken["type"] };

export type DraftSuggestion<F> = {
  editor: Editor;
  range: Range;
  query: string;
  getCaretRect: GetAnchorRect;
  pick: (item: DraftPick<F>) => void;
};

export type DraftSuggestionOptions<F> = {
  actions: DraftActions<F>;
  onChange: (suggestion: DraftSuggestion<F> | null) => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export const createDraftSuggestion = <F>({
  actions,
  onChange,
  onKeyDown,
}: DraftSuggestionOptions<F>) => {
  const pick = (editor: Editor, range: Range, item: DraftPick<F>) => {
    const stage = getStageAt(editor.state.doc, range.from);
    match(item)
      .with({ type: "column" }, ({ column, targetStage }) =>
        actions.pickColumn(editor, range, column, targetStage ?? stage),
      )
      .with({ type: "filter" }, ({ filter }) =>
        actions.commitFilter(editor, range, filter, stage),
      )
      .with({ type: "operator" }, ({ operator }) =>
        actions.pickOperator(editor, range, operator),
      )
      .with({ type: "boolOp" }, ({ boolOp }) =>
        insertBoolOp(
          { chain: () => editor.chain(), state: editor.state, range },
          boolOp,
        ),
      )
      .exhaustive();
  };

  const report = ({
    editor,
    range,
    query,
    clientRect,
    command,
  }: SuggestionProps<DraftPick<F>, DraftPick<F>>) =>
    onChange({
      editor,
      range,
      query,
      getCaretRect: () => {
        const caret = editor.view.dom.querySelector("[data-caret-frame]");
        const frame = caret?.closest("[data-editing]") ?? caret;
        return frame?.getBoundingClientRect() ?? clientRect?.() ?? null;
      },
      pick: command,
    });

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
          render: () => ({
            onStart: report,
            onUpdate: report,
            onKeyDown: ({ event }) => onKeyDown(event),
            onExit: () => onChange(null),
          }),
        }),
      ];
    },
  });
};
