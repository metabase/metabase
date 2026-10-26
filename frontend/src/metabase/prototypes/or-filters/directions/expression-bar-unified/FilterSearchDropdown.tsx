import { useMemo } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import { Box, Icon, Stack, Text, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./ExpressionBar.module.css";
import { type SummaryStage, getAggregationColumns } from "./summary";
import {
  CLOSE_PAREN,
  type ExpressionToken,
  NOT_TOKEN,
  OPEN_PAREN,
  type Token,
  opToken,
  parseTypedToken,
} from "./tokens";

const MAX_COLUMN_SUGGESTIONS = 8;

/** A column the bar can filter on, with the stage it lives on. */
export type StagedColumn = {
  column: Lib.ColumnMetadata;
  stageIndex: number;
  /** The column is an aggregation of the summary: its filter applies after summarizing. */
  isSummary: boolean;
};

export type Suggestion<T extends ExpressionToken = Token> =
  | { type: "token"; token: T; label: string }
  | { type: "column"; column: StagedColumn; label: string }
  | { type: "browse"; label: string };

const KEYWORDS: { word: string; token: ExpressionToken }[] = [
  { word: "and", token: opToken("and") },
  { word: "or", token: opToken("or") },
  { word: "not", token: NOT_TOKEN },
  { word: "(", token: OPEN_PAREN },
  { word: ")", token: CLOSE_PAREN },
];

type SuggestionOptions = {
  withNot?: boolean;
  /** Offers the summary's aggregation columns after the stage's own columns. */
  summary?: SummaryStage;
};

/**
 * What the bar offers for the typed text: boolean keywords, matching
 * filterable columns (the summary's aggregations after the rows' columns),
 * and the full picker as a fallback. Exported so the bar can drive keyboard
 * selection with the same list.
 */
export function useSuggestions(
  query: Lib.Query,
  stageIndex: number,
  text: string,
  options?: SuggestionOptions & { withNot?: false },
): Suggestion[];
export function useSuggestions(
  query: Lib.Query,
  stageIndex: number,
  text: string,
  options: SuggestionOptions & { withNot: true },
): Suggestion<ExpressionToken>[];
export function useSuggestions(
  query: Lib.Query,
  stageIndex: number,
  text: string,
  { withNot = false, summary }: SuggestionOptions = {},
): Suggestion<ExpressionToken>[] {
  return useMemo(() => {
    const needle = text.trim().toLowerCase();
    const keywordSuggestions: Suggestion<ExpressionToken>[] = KEYWORDS.filter(
      ({ word }) =>
        needle.length > 0 &&
        word.startsWith(needle) &&
        (withNot || word !== "not"),
    ).map(({ word, token }) => ({ type: "token", token, label: word }));

    const rowColumns = Lib.filterableColumns(query, stageIndex).map(
      (column) => ({
        column: { column, stageIndex, isSummary: false },
        label: Lib.displayInfo(query, stageIndex, column).longDisplayName,
      }),
    );
    const summaryColumns = summary
      ? getAggregationColumns(query, stageIndex, summary).map((column) => ({
          column: { column, stageIndex: summary.stageIndex, isSummary: true },
          label: Lib.displayInfo(summary.query, summary.stageIndex, column)
            .longDisplayName,
        }))
      : [];

    const matching = (candidates: { column: StagedColumn; label: string }[]) =>
      candidates
        .filter(({ label }) => label.toLowerCase().includes(needle))
        .slice(0, MAX_COLUMN_SUGGESTIONS)
        .map(
          ({ column, label }): Suggestion<ExpressionToken> => ({
            type: "column",
            column,
            label,
          }),
        );

    return [
      ...keywordSuggestions,
      ...matching(rowColumns),
      ...matching(summaryColumns),
      { type: "browse", label: t`Browse all filters…` },
    ];
  }, [query, stageIndex, text, withNot, summary]);
}

/** Which pane the dropdown shows: the suggestion list, one column's widget, or the full picker. */
export type DropdownView =
  | { type: "list" }
  | { type: "column"; column: StagedColumn }
  | { type: "browse" };

type FilterSearchDropdownProps<T extends ExpressionToken> = {
  /** The query for the stage a column lives on; the summary stage may need an appended one. */
  queryFor: (stageIndex: number) => Lib.Query;
  stageIndex: number;
  text: string;
  view: DropdownView;
  /** `true` mentions "not" in the hint, for bars that have a `not` token. */
  withNot?: boolean;
  suggestions: Suggestion<T>[];
  activeIndex: number;
  onViewChange: (view: DropdownView) => void;
  onHover: (index: number) => void;
  onPickColumn: (column: StagedColumn) => void;
  onBrowse: () => void;
  onPickToken: (token: T) => void;
  onPickFilter: (filterable: Lib.Filterable, stageIndex: number) => void;
  onClose: () => void;
};

/**
 * The dropdown under the bar's caret. Lists suggestions for the typed text;
 * picking a column swaps in that column's filter widget, "Browse" swaps in the
 * full picker for the rows.
 */
export function FilterSearchDropdown<T extends ExpressionToken = Token>({
  queryFor,
  stageIndex,
  text,
  view,
  withNot = false,
  suggestions,
  activeIndex,
  onViewChange,
  onHover,
  onPickColumn,
  onBrowse,
  onPickToken,
  onPickFilter,
  onClose,
}: FilterSearchDropdownProps<T>) {
  if (view.type === "column") {
    const { column, stageIndex: columnStageIndex } = view.column;
    return (
      <FilterPickerBody
        query={queryFor(columnStageIndex)}
        stageIndex={columnStageIndex}
        column={column}
        isNew
        onChange={(filterable) => onPickFilter(filterable, columnStageIndex)}
        onBack={() => onViewChange({ type: "list" })}
      />
    );
  }

  if (view.type === "browse") {
    return (
      <FilterPicker
        query={queryFor(stageIndex)}
        stageIndex={stageIndex}
        onSelect={(filterable) => onPickFilter(filterable, stageIndex)}
        onClose={onClose}
      />
    );
  }

  return (
    <Stack gap={0} py="xs" miw={360}>
      {parseTypedToken(text) == null && text.trim().length === 0 && (
        <Text size="xs" c="text-secondary" px="sm" py="xs">
          <EmptyTextHint withNot={withNot} />
        </Text>
      )}
      {suggestions.map((suggestion, index) => (
        <UnstyledButton
          key={index}
          className={
            index === activeIndex
              ? `${S.suggestion} ${S.suggestionActive}`
              : S.suggestion
          }
          onMouseEnter={() => onHover(index)}
          // mousedown keeps the bar's input focused and its popover open.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            activateSuggestion(suggestion, {
              onPickToken,
              onPickColumn,
              onBrowse,
            })
          }
        >
          <SuggestionLabel suggestion={suggestion} />
        </UnstyledButton>
      ))}
    </Stack>
  );
}

export function activateSuggestion<T extends ExpressionToken>(
  suggestion: Suggestion<T>,
  handlers: {
    onPickToken: (token: T) => void;
    onPickColumn: (column: StagedColumn) => void;
    onBrowse: () => void;
  },
) {
  if (suggestion.type === "token") {
    handlers.onPickToken(suggestion.token);
  } else if (suggestion.type === "column") {
    handlers.onPickColumn(suggestion.column);
  } else {
    handlers.onBrowse();
  }
}

function SuggestionLabel({
  suggestion,
}: {
  suggestion: Suggestion<ExpressionToken>;
}) {
  if (suggestion.type === "token") {
    return (
      <>
        <Box className={S.keyword}>{suggestion.label}</Box>
        <Text size="sm" c="text-secondary">
          {t`operator`}
        </Text>
      </>
    );
  }
  if (suggestion.type === "column") {
    const { column, isSummary } = suggestion.column;
    return (
      <>
        <Icon
          name={isSummary ? "sum" : getColumnIcon(column)}
          size={18}
          className={isSummary ? S.suggestionSummaryIcon : S.suggestionIcon}
        />
        <Text fw="bold" className={S.suggestionTitle}>
          {suggestion.label}
        </Text>
        {isSummary && (
          <Text size="sm" c="text-secondary" className={S.suggestionHint}>
            {t`after summarizing`}
          </Text>
        )}
      </>
    );
  }
  return (
    <>
      <Icon name="ellipsis" size={18} className={S.suggestionIcon} />
      <Text fw="bold" className={S.suggestionTitle}>
        {suggestion.label}
      </Text>
    </>
  );
}

function EmptyTextHint({ withNot }: { withNot: boolean }) {
  return withNot
    ? t`Type a column name, or "and", "or", "not", "(", ")"`
    : t`Type a column name, or "and", "or", "(", ")"`;
}
