import type { ReactNode, Ref } from "react";
import { P, match } from "ts-pattern";

import { Popover } from "metabase/ui";

import {
  type DraftState,
  type DraftStep,
  findDraftStartingAt,
  getStageAt,
  readDraft,
} from "../../editor";
import type { ConnectorToken } from "../../model";
import type { FilterBarAdapter } from "../../types";
import { AnchorTarget, type GetAnchorRect } from "../AnchorTarget/AnchorTarget";
import type { DraftPick, DraftSuggestion } from "../FilterBar/draft-suggestion";
import { LogicOperatorsHint } from "../LogicOperatorsHint/LogicOperatorsHint";
import {
  type ListKeys,
  SuggestionList,
} from "../SuggestionList/SuggestionList";
import type { SuggestionGroup } from "../SuggestionList/utils";

import { findExactColumn, getColumnSuggestions } from "./columns";
import { findExactOperator, getOperatorSuggestions } from "./operators";

type DraftListView<F> = {
  step: DraftStep;
  groups: SuggestionGroup<DraftPick<F>>[];
  exact: DraftPick<F> | null;
};

const NEW_DRAFT: Pick<DraftState, "step" | "column"> = {
  step: "column",
  column: null,
};

const getTypedConnector = (query: string): ConnectorToken["type"] | null =>
  match(query.trim().toLowerCase())
    .with("and", "or", (type) => type)
    .otherwise(() => null);

const getDraftListView = <F,>(
  adapter: FilterBarAdapter<F>,
  { editor, range, query }: DraftSuggestion<F>,
): DraftListView<F> | null => {
  const { doc } = editor.state;
  const draft = findDraftStartingAt(doc, range.from);
  const view = match(draft ? readDraft(draft) : NEW_DRAFT)
    .with({ step: "column" }, (): DraftListView<F> => {
      const columns = adapter.stage(getStageAt(doc, range.from)).columnGroups();
      const connector = getTypedConnector(query);
      return {
        step: "column",
        groups: getColumnSuggestions(columns, query, connector),
        exact: connector ? null : findExactColumn(columns, query),
      };
    })
    .with(
      { step: "operator", column: P.nonNullable },
      ({ column: { column, stage } }): DraftListView<F> => {
        const operators = adapter.stage(stage).operators(column) ?? [];
        const exact = findExactOperator(operators.flat(), query);
        return {
          step: "operator",
          groups: getOperatorSuggestions(operators, query),
          exact: exact ? { type: "operator", operator: exact } : null,
        };
      },
    )
    .otherwise(() => null);
  return view && view.groups.length > 0 ? view : null;
};

type FilterPopoverProps<F> = {
  adapter: FilterBarAdapter<F>;
  suggestion: DraftSuggestion<F> | null;
  filterEditor: ReactNode;
  getFilterEditorRect: GetAnchorRect;
  listKeys: Ref<ListKeys>;
  onDismiss: () => void;
};

export const FilterPopover = <F,>({
  adapter,
  suggestion,
  filterEditor,
  getFilterEditorRect,
  listKeys,
  onDismiss,
}: FilterPopoverProps<F>) => {
  const hasFilterEditor = Boolean(filterEditor);
  const listView =
    suggestion && !hasFilterEditor
      ? getDraftListView(adapter, suggestion)
      : null;

  return (
    <Popover
      opened={hasFilterEditor || listView !== null}
      position="bottom-start"
      offset={4}
      trapFocus={false}
      returnFocus={false}
      onDismiss={onDismiss}
    >
      <Popover.Target>
        <AnchorTarget
          getRect={
            hasFilterEditor ? getFilterEditorRect : suggestion?.getCaretRect
          }
        />
      </Popover.Target>
      <Popover.Dropdown p={0}>
        {hasFilterEditor
          ? filterEditor
          : listView &&
            suggestion && (
              <SuggestionList
                key={listView.step}
                groups={listView.groups}
                query={suggestion.query}
                exact={listView.exact}
                keys={listKeys}
                footer={listView.step === "column" && <LogicOperatorsHint />}
                onPick={suggestion.pick}
              />
            )}
      </Popover.Dropdown>
    </Popover>
  );
};
