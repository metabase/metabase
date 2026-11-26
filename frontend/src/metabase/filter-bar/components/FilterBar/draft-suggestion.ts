import { type Editor, Extension, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { match } from "ts-pattern";

import {
  DRAFT_SUGGESTION_KEY,
  type DraftActions,
  findPartStep,
  getStageAt,
  insertConnector,
} from "../../editor";
import type { ConnectorToken } from "../../model";
import type { ColumnItem, FilterOperator } from "../../types";
import type { GetAnchorRect } from "../AnchorTarget/AnchorTarget";

export type DraftPick<F> =
  | ColumnItem<F>
  | { type: "operator"; operator: FilterOperator }
  | { type: "connector"; connector: ConnectorToken["type"] };

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

  const report = ({
    editor,
    range,
    query,
    clientRect,
    command,
  }: SuggestionProps<DraftPick<F>, DraftPick<F>>) =>
    onChange({ editor, range, query, getCaretRect: clientRect, pick: command });

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
