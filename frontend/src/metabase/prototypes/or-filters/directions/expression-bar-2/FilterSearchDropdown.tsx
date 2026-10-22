import { useMemo } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import { Box, Icon, Stack, Text, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./ExpressionBar.module.css";
import {
  CLOSE_PAREN,
  OPEN_PAREN,
  type Token,
  opToken,
  parseTypedToken,
} from "./tokens";

const MAX_COLUMN_SUGGESTIONS = 8;

export type Suggestion =
  | { type: "token"; token: Token; label: string }
  | { type: "column"; column: Lib.ColumnMetadata; label: string }
  | { type: "browse"; label: string };

const KEYWORDS: { word: string; token: Token }[] = [
  { word: "and", token: opToken("and") },
  { word: "or", token: opToken("or") },
  { word: "(", token: OPEN_PAREN },
  { word: ")", token: CLOSE_PAREN },
];

/**
 * What the bar offers for the typed text: boolean keywords, matching
 * filterable columns, and the full picker as a fallback. Exported so the bar
 * can drive keyboard selection with the same list.
 */
export function useSuggestions(
  query: Lib.Query,
  stageIndex: number,
  text: string,
  { allowOr = true }: { allowOr?: boolean } = {},
): Suggestion[] {
  return useMemo(() => {
    const needle = text.trim().toLowerCase();
    const keywordSuggestions: Suggestion[] = KEYWORDS.filter(
      ({ word }) =>
        needle.length > 0 &&
        word.startsWith(needle) &&
        (allowOr || word !== "or"),
    ).map(({ word, token }) => ({ type: "token", token, label: word }));

    const columnSuggestions: Suggestion[] = Lib.filterableColumns(
      query,
      stageIndex,
    )
      .map((column) => ({
        column,
        label: Lib.displayInfo(query, stageIndex, column).longDisplayName,
      }))
      .filter(({ label }) => label.toLowerCase().includes(needle))
      .slice(0, MAX_COLUMN_SUGGESTIONS)
      .map(({ column, label }) => ({ type: "column", column, label }));

    return [
      ...keywordSuggestions,
      ...columnSuggestions,
      { type: "browse", label: t`Browse all filters…` },
    ];
  }, [query, stageIndex, text, allowOr]);
}

/** Which pane the dropdown shows: the suggestion list, one column's widget, or the full picker. */
export type DropdownView =
  | { type: "list" }
  | { type: "column"; column: Lib.ColumnMetadata }
  | { type: "browse" };

type FilterSearchDropdownProps = {
  query: Lib.Query;
  stageIndex: number;
  text: string;
  view: DropdownView;
  /** `false` hides "or" from the hint; the segment only takes "and". */
  allowOr?: boolean;
  suggestions: Suggestion[];
  activeIndex: number;
  onViewChange: (view: DropdownView) => void;
  onHover: (index: number) => void;
  onPickColumn: (column: Lib.ColumnMetadata) => void;
  onBrowse: () => void;
  onPickToken: (token: Token) => void;
  onPickFilter: (filterable: Lib.Filterable) => void;
  onClose: () => void;
};

/**
 * The dropdown under the bar's caret. Lists suggestions for the typed text;
 * picking a column swaps in that column's filter widget, "Browse" swaps in the
 * full picker.
 */
export function FilterSearchDropdown({
  query,
  stageIndex,
  text,
  view,
  allowOr = true,
  suggestions,
  activeIndex,
  onViewChange,
  onHover,
  onPickColumn,
  onBrowse,
  onPickToken,
  onPickFilter,
  onClose,
}: FilterSearchDropdownProps) {
  if (view.type === "column") {
    return (
      <FilterPickerBody
        query={query}
        stageIndex={stageIndex}
        column={view.column}
        isNew
        onChange={onPickFilter}
        onBack={() => onViewChange({ type: "list" })}
      />
    );
  }

  if (view.type === "browse") {
    return (
      <FilterPicker
        query={query}
        stageIndex={stageIndex}
        onSelect={onPickFilter}
        onClose={onClose}
      />
    );
  }

  return (
    <Stack gap={0} p="xs" miw={320}>
      {parseTypedToken(text) == null && text.trim().length === 0 && (
        <Text size="xs" c="text-secondary" px="sm" py="xs">
          {allowOr
            ? t`Type a column name, or "and", "or", "(", ")"`
            : t`Type a column name, or "and"`}
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

export function activateSuggestion(
  suggestion: Suggestion,
  handlers: {
    onPickToken: (token: Token) => void;
    onPickColumn: (column: Lib.ColumnMetadata) => void;
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

function SuggestionLabel({ suggestion }: { suggestion: Suggestion }) {
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
    return (
      <>
        <Icon name="filter" c="text-secondary" />
        <Text size="sm">{suggestion.label}</Text>
      </>
    );
  }
  return (
    <>
      <Icon name="ellipsis" c="text-secondary" />
      <Text size="sm" c="text-secondary">
        {suggestion.label}
      </Text>
    </>
  );
}
