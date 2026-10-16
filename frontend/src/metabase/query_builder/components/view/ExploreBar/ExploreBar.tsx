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

import { PinButton } from "../ExplorePins";

import { CutStrip } from "./CutStrip";
import S from "./ExploreBar.module.css";
import { ExplorePill, type ExplorePillItem } from "./ExplorePill";
import {
  type ExploreSuggestion,
  type ExploreSuggestionContext,
  getExploreSuggestions,
} from "./suggestions";
import { useColumnValues } from "./use-column-values";
import { useExploreHistory } from "./use-explore-history";
import { useExploreUpdate } from "./use-explore-update";
import { STAGE_INDEX, withExploreQuery } from "./utils";

type ExploreBarProps = {
  question: Question;
};

/**
 * The one bar that drives the query builder. The bar holds the slice: what you're looking at,
 * narrowed by typing ("gadget", "last 30 days", "price over 50") or by clicking the result.
 * Below it, the cut strip moves the same slice between rows, a total, and groupings, and
 * between views, without touching the slice. Typing a calculation or "by state" works too.
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
  const pills = useMemo(() => getFilterPills(query), [query]);
  const history = useExploreHistory(question, (restoredQuestion) =>
    updateExploreQuestion(question, restoredQuestion),
  );

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
      <Flex className={S.bar} align="center" gap="xs" wrap="wrap">
        <Icon name="search" className={S.leadingIcon} />
        {pills.length === 0 && (
          <Text className={S.sliceLabel}>{t`All rows`}</Text>
        )}
        {pills.map((pill) => (
          <ExplorePill
            key={pill.key}
            pill={pill}
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
        <Box ml="auto">
          <PinButton question={question} />
        </Box>
      </Flex>
      <CutStrip
        question={question}
        history={history}
        onQueryChange={handleQueryChange}
        onQuestionChange={(nextQuestion) =>
          updateExploreQuestion(question, nextQuestion)
        }
      />
    </Box>
  );
}

function getFilterPills(query: Lib.Query): ExplorePillItem[] {
  return Lib.filters(query, STAGE_INDEX).map(
    (clause, index): ExplorePillItem => ({
      key: `filter:${index}`,
      kind: "filter",
      clause,
      index,
      label: Lib.displayInfo(query, STAGE_INDEX, clause).displayName,
    }),
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
