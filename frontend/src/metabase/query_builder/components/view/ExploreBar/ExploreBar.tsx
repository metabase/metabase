import cx from "classnames";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { Box, Combobox, Flex, Icon, Text, useCombobox } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { ExploreActions } from "./ExploreActions";
import S from "./ExploreBar.module.css";
import { ExplorePill, type ExplorePillItem } from "./ExplorePill";
import {
  type ExploreSuggestion,
  type ExploreSuggestionContext,
  getExploreSuggestions,
} from "./suggestions";
import { useColumnValues } from "./use-column-values";
import { useExploreUpdate } from "./use-explore-update";
import { STAGE_INDEX, withExploreQuery } from "./utils";

type ExploreBarProps = {
  question: Question;
};

/**
 * The bar above the view on screen: its clauses as pills, typing to search, filter, or
 * summarize ("gadget", "last 30 days", "sum of total by state"), and the view's actions.
 * Clicking the result narrows the view too. Every change makes a new temporary view in the
 * views panel, which Save keeps.
 */
export function ExploreBar({ question }: ExploreBarProps) {
  const query = question.query();
  const updateExploreQuestion = useExploreUpdate();
  const [hasFocused, setHasFocused] = useState(false);
  const columnValues = useColumnValues(query, STAGE_INDEX, hasFocused);
  const context = useMemo<ExploreSuggestionContext>(
    () => ({ query, stageIndex: STAGE_INDEX, columnValues }),
    [query, columnValues],
  );
  const pills = useMemo(() => getPills(query), [query]);

  const handleQueryChange = (nextQuery: Lib.Query) => {
    updateExploreQuestion(question, withExploreQuery(question, nextQuery));
  };

  const handleRemoveLastPill = () => {
    const lastPill = pills.at(-1);
    if (lastPill) {
      handleQueryChange(Lib.removeClause(query, STAGE_INDEX, lastPill.clause));
    }
  };

  return (
    <Box className={S.root} data-testid="explore-bar">
      <Flex align="center" gap="sm">
        <Flex className={S.bar} align="center" gap="xs" wrap="wrap" flex={1}>
          <Icon name="search" className={S.leadingIcon} />
          {pills.map((pill, index) => (
            <PillWithJoiner
              key={pill.key}
              pill={pill}
              previousPill={pills[index - 1]}
              query={query}
              onQueryChange={handleQueryChange}
            />
          ))}
          <ExploreInput
            context={context}
            hasPills={pills.length > 0}
            onFocus={() => setHasFocused(true)}
            onApply={(suggestion) =>
              suggestion.apply && handleQueryChange(suggestion.apply(query))
            }
            onRemoveLastPill={handleRemoveLastPill}
          />
        </Flex>
        <ExploreActions
          question={question}
          context={context}
          isSaved={question.isSaved()}
          onQueryChange={handleQueryChange}
          onQuestionChange={(nextQuestion) =>
            updateExploreQuestion(question, nextQuestion)
          }
        />
      </Flex>
    </Box>
  );
}

function getPills(query: Lib.Query): ExplorePillItem[] {
  const filters = Lib.filters(query, STAGE_INDEX).map(
    (clause, index): ExplorePillItem => ({
      key: `filter:${index}`,
      kind: "filter",
      clause,
      index,
      label: Lib.displayInfo(query, STAGE_INDEX, clause).displayName,
    }),
  );
  const aggregations = Lib.aggregations(query, STAGE_INDEX).map(
    (clause, index): ExplorePillItem => ({
      key: `aggregation:${index}`,
      kind: "aggregation",
      clause,
      index,
      label: Lib.displayInfo(query, STAGE_INDEX, clause).displayName,
    }),
  );
  const breakouts = Lib.breakouts(query, STAGE_INDEX).map(
    (clause, index): ExplorePillItem => ({
      key: `breakout:${index}`,
      kind: "breakout",
      clause,
      index,
      label: Lib.displayInfo(query, STAGE_INDEX, clause).displayName,
    }),
  );
  return [...filters, ...aggregations, ...breakouts];
}

type PillWithJoinerProps = {
  pill: ExplorePillItem;
  previousPill: ExplorePillItem | undefined;
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
};

/** Pills read like a sentence: "Category is Gadget · Sum of Total by Created At: Month". */
function PillWithJoiner({
  pill,
  previousPill,
  query,
  onQueryChange,
}: PillWithJoinerProps) {
  const isFirstOfKind = previousPill?.kind !== pill.kind;
  const hasJoiner = pill.kind === "breakout" && isFirstOfKind;
  const hasDivider =
    isFirstOfKind && previousPill != null && pill.kind === "aggregation";

  return (
    <>
      {hasDivider && <Box className={S.divider} />}
      {hasJoiner && <Text className={S.joiner}>{t`by`}</Text>}
      <ExplorePill pill={pill} query={query} onQueryChange={onQueryChange} />
    </>
  );
}

type ExploreInputProps = {
  context: ExploreSuggestionContext;
  hasPills: boolean;
  onFocus: () => void;
  onApply: (suggestion: ExploreSuggestion) => void;
  onRemoveLastPill: () => void;
};

function ExploreInput({
  context,
  hasPills,
  onFocus,
  onApply,
  onRemoveLastPill,
}: ExploreInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const suggestions = useMemo(
    () => getExploreSuggestions(context, text),
    [context, text],
  );

  useEffect(() => {
    if (combobox.dropdownOpened) {
      combobox.selectFirstOption();
    }
  }, [suggestions, combobox]);

  const handleSubmit = (id: string) => {
    const suggestion = suggestions.find((suggestion) => suggestion.id === id);
    if (suggestion?.apply == null) {
      return;
    }
    onApply(suggestion);
    setText("");
    combobox.closeDropdown();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && text.length === 0 && hasPills) {
      event.preventDefault();
      onRemoveLastPill();
    }
    if (event.key === "Escape") {
      setText("");
      combobox.closeDropdown();
      inputRef.current?.blur();
    }
  };

  const placeholder = hasPills
    ? t`Narrow it down, or type a calculation…`
    : t`Search, filter, or summarize. Try “gadget”, “last 30 days”, “sum of total by month”, or “= [Price] * 2”`;

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      width={460}
      offset={8}
      withinPortal
      onOptionSubmit={handleSubmit}
    >
      <Combobox.Target>
        <input
          ref={inputRef}
          className={S.input}
          value={text}
          placeholder={placeholder}
          aria-label={t`Search, filter, or summarize`}
          onChange={(event) => {
            setText(event.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => {
            onFocus();
            combobox.openDropdown();
          }}
          onClick={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={handleKeyDown}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={suggestions.length === 0}>
        <Combobox.Options mah="24rem" style={{ overflowY: "auto" }}>
          {text.trim().length === 0 && (
            <Text className={S.dropdownTitle}>{t`Try`}</Text>
          )}
          {suggestions.map((suggestion) => (
            <Combobox.Option
              key={suggestion.id}
              value={suggestion.id}
              disabled={suggestion.apply == null}
              className={S.option}
            >
              <SuggestionItem suggestion={suggestion} />
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

function SuggestionItem({ suggestion }: { suggestion: ExploreSuggestion }) {
  return (
    <Flex align="center" gap="sm" miw={0}>
      <Box className={cx(S.optionIcon, S[`kind-${suggestion.kind}`])}>
        <Icon name={suggestion.icon} size={14} />
      </Box>
      <Text
        className={S.optionLabel}
        c={suggestion.kind === "invalid" ? "error" : undefined}
        truncate
      >
        {suggestion.label}
      </Text>
      {suggestion.hint && (
        <Text size="sm" c="text-tertiary" ml="auto" style={{ flexShrink: 0 }}>
          {suggestion.hint}
        </Text>
      )}
    </Flex>
  );
}
