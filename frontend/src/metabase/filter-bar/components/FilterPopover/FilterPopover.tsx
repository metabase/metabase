import type { ReactNode, Ref } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { Flex, Icon, Kbd, Popover, Text } from "metabase/ui";

import {
  type DraftPick,
  type DraftState,
  type DraftStep,
  type DraftSuggestion,
  findDraftStartingAt,
  getStageAt,
  readDraft,
} from "../../editor";
import { BOOL_OP_TEXT, type BoolOpToken, PAREN_TEXT } from "../../model";
import type { FilterBarAdapter } from "../../types";
import { AnchorTarget, type GetAnchorRect } from "../AnchorTarget/AnchorTarget";
import {
  type ListKeys,
  SuggestionList,
} from "../SuggestionList/SuggestionList";
import type { SuggestionGroup } from "../SuggestionList/utils";

import { findExactColumn, getColumnSuggestions } from "./columns";
import { findExactOperator, getOperatorSuggestions } from "./operators";

const LOGIC_OPERATORS = [
  ...Object.values(BOOL_OP_TEXT),
  ...Object.values(PAREN_TEXT),
];

type DraftListView<F> = {
  step: DraftStep;
  groups: SuggestionGroup<DraftPick<F>>[];
  exact: DraftPick<F> | null;
};

const NEW_DRAFT: Pick<DraftState, "step" | "column"> = {
  step: "column",
  column: null,
};

const getTypedBoolOp = (query: string) =>
  match(query.trim().toLowerCase())
    .returnType<BoolOpToken["type"] | null>()
    .with(BOOL_OP_TEXT.and, () => "and")
    .with(BOOL_OP_TEXT.or, () => "or")
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
      const boolOp = getTypedBoolOp(query);
      return {
        step: "column",
        groups: getColumnSuggestions(columns, query, boolOp),
        exact: boolOp ? null : findExactColumn(columns, query),
      };
    })
    .with(
      { step: "operator", column: P.nonNullable },
      ({ column: { column, targetStage } }): DraftListView<F> => {
        const operators = adapter.stage(targetStage).operators(column) ?? [];
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
      offset={{ mainAxis: 8, crossAxis: -8 }}
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
                footer={
                  listView.step === "column" && (
                    <Flex
                      align="center"
                      justify="space-between"
                      py="sm"
                      px="xl"
                    >
                      <Flex align="center" gap="sm" c="text-secondary">
                        <Icon name="info" size={12} />
                        <Text fz="sm" lh={1.15} c="inherit">
                          {t`Logic operators available`}
                        </Text>
                      </Flex>
                      <Flex align="center" gap="3px">
                        {LOGIC_OPERATORS.map((operator, index) => (
                          <Flex key={operator} align="flex-end">
                            <Kbd fz="sm" c="text-primary" tt="uppercase">
                              {operator}
                            </Kbd>
                            {index < LOGIC_OPERATORS.length - 1 && (
                              <Text fz="sm" lh={1.15} c="text-secondary">
                                ,
                              </Text>
                            )}
                          </Flex>
                        ))}
                      </Flex>
                    </Flex>
                  )
                }
                onPick={suggestion.pick}
              />
            )}
      </Popover.Dropdown>
    </Popover>
  );
};
