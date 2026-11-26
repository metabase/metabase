import type { ReactNode, Ref } from "react";
import { P, match } from "ts-pattern";

import { Popover } from "metabase/ui";

import {
  type DraftState,
  findDraftStartingAt,
  getStageAt,
  readDraft,
} from "../../editor";
import type { ConnectorToken } from "../../model";
import type {
  ColumnGroup,
  FilterBarAdapter,
  FilterOperatorGroup,
} from "../../types";
import { AnchorTarget, type GetAnchorRect } from "../AnchorTarget/AnchorTarget";
import { ColumnList } from "../ColumnList/ColumnList";
import { buildList } from "../ColumnList/utils";
import type { DraftPick, DraftSuggestion } from "../FilterBar/draft-suggestion";
import { OperatorList } from "../OperatorList/OperatorList";
import { findOperatorGroups } from "../OperatorList/utils";
import type { ListKeys } from "../SuggestionList/SuggestionList";

type DraftListView<F> =
  | {
      type: "columns";
      groups: readonly ColumnGroup<F>[];
      connector: ConnectorToken["type"] | null;
    }
  | { type: "operators"; groups: readonly FilterOperatorGroup[] };

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
  return match(draft ? readDraft(draft) : NEW_DRAFT)
    .with({ step: "column" }, (): DraftListView<F> | null => {
      const groups = adapter.stage(getStageAt(doc, range.from)).columnGroups();
      const connector = getTypedConnector(query);
      const hasColumns = buildList(groups, query, new Set()).length > 0;
      return hasColumns || connector
        ? { type: "columns", groups, connector }
        : null;
    })
    .with(
      { step: "operator", column: P.nonNullable },
      ({ column: { column, stage } }): DraftListView<F> | null => {
        const groups = adapter.stage(stage).operators(column) ?? [];
        const hasOperators = findOperatorGroups(groups, query).length > 0;
        return hasOperators ? { type: "operators", groups } : null;
      },
    )
    .otherwise(() => null);
};

type DraftListProps<F> = {
  view: DraftListView<F>;
  query: string;
  keys: Ref<ListKeys>;
  onPick: (item: DraftPick<F>) => void;
};

const DraftList = <F,>({ view, query, keys, onPick }: DraftListProps<F>) =>
  match(view)
    .with({ type: "columns" }, ({ groups, connector }) => (
      <ColumnList
        groups={groups}
        query={query}
        keys={keys}
        connector={connector}
        onPick={onPick}
        onPickConnector={(connector) =>
          onPick({ type: "connector", connector })
        }
      />
    ))
    .with({ type: "operators" }, ({ groups }) => (
      <OperatorList
        groups={groups}
        query={query}
        keys={keys}
        onPick={(operator) => onPick({ type: "operator", operator })}
      />
    ))
    .exhaustive();

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
              <DraftList
                view={listView}
                query={suggestion.query}
                keys={listKeys}
                onPick={suggestion.pick}
              />
            )}
      </Popover.Dropdown>
    </Popover>
  );
};
