import { useClickOutside } from "@mantine/hooks";
import { skipToken } from "@reduxjs/toolkit/query/react";
import cx from "classnames";
import type { KeyboardEvent, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  useGetFieldValuesQuery,
  useSearchFieldValuesQuery,
} from "metabase/api";
import { getColumnIcon } from "metabase/common/utils/columns";
import { RelativeDatePicker } from "metabase/querying/common/components/DatePicker/RelativeDatePicker";
import { SpecificDatePicker } from "metabase/querying/common/components/DatePicker/SpecificDatePicker";
import { getOperatorDefaultValue } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/utils";
import {
  DATE_PICKER_DIRECTIONS,
  DATE_PICKER_OPERATORS,
} from "metabase/querying/common/constants";
import type {
  DatePickerValue,
  SpecificDatePickerOperator,
} from "metabase/querying/common/types";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import {
  canListFieldValues,
  canSearchFieldValues,
} from "metabase/querying/filters/components/FilterPicker/FilterValuePicker/utils";
import { HistogramSlider } from "metabase/querying/filters/components/FilterPicker/NumberFilterPicker/HistogramSlider";
import {
  useNumberColumnStats,
  useValueCounts,
} from "metabase/querying/filters/components/FilterPicker/NumberFilterPicker/NumberColumnStats";
import { getDatePickerUnits } from "metabase/querying/filters/utils/dates";
import { Flex, Icon, Kbd, Loader, Popover, Tooltip } from "metabase/ui";
import { parseNumber } from "metabase/utils/number";
import * as Lib from "metabase-lib";

import { ExcludeDateValueInput } from "./ExcludeDateValueInput";
import S from "./KeyboardFilterRow.module.css";
import { SuggestionInput } from "./SuggestionInput";
import { ValueBox, ValueText, joinValueLabels } from "./ValueText";
import {
  type AiValuesState,
  getAiPromptText,
  isAiPrompt,
  useAiFilterValues,
} from "./ai-filter-values";
import {
  AI_FILTERS_OPTION,
  type AiFiltersState,
  isAiFiltersPrompt,
  useAiFilters,
} from "./ai-filters";
import { useColumnSuggestions } from "./column-picker";
import { useDatePickerKeyboard } from "./date-picker-keyboard";
import { useSemanticColumnMatches } from "./semantic-column-search";
import type {
  DraftColumn,
  DraftOperator,
  DraftState,
  SuggestionGroup,
} from "./types";
import {
  type ColumnGroup,
  changeDraftColumn,
  findItemByTypedName,
  formatDraftValue,
  getColumnGroups,
  getDraftFilterClause,
  getMaxValueCount,
  getOperatorAliases,
  getOperatorHint,
  getOperatorNames,
  getPillOperatorLabel,
  isValidValue,
  parseDatePickerValue,
  stringifyDatePickerValue,
} from "./utils";
import {
  SELECT_ALL_VALUE,
  type ValueAndLabel,
  formatShare,
  hasValueShares,
  useValueWidget,
} from "./value-widgets";

const SEARCH_LIMIT = 20;
const COLUMN_DROPDOWN_WIDTH = 340;
// 1.5 times the max height of the other dropdowns of the pill.
const COLUMN_OPTIONS_MAX_HEIGHT = "30rem";

export type DraftChangeSource = "selection" | "typing";

/** Why the user left the pill without a filter. */
export type CancelReason = "escape" | "back" | "click-outside";

/** What the pill knows when a key is pressed in its column step. */
export type ColumnKeyState = {
  text: string;
  /** An option in the list is highlighted, so Enter picks it. */
  hasSelectedOption: boolean;
};

/** Options from `leadingGroups`/`trailingGroups` start with this; they go to `onSelectExtra`. */
export const EXTRA_OPTION_PREFIX = "extra:";

/** Shared by the empty filter bar and the draft's column input. */
export const getFilterPlaceholder = () => t`Type to filter...`;

interface DraftFilterPillProps {
  query: Lib.Query;
  stageIndex: number;
  /** The filter that the pill edits, or undefined for a new filter. */
  filter?: Lib.FilterClause;
  initialState?: DraftState;
  /** The part of the filter to edit first, or undefined for the values. */
  initialEditedPart?: "column" | "operator";
  /** The text in the input when the pill opens. */
  initialText?: string;
  /** False between the pills of a bar, so the caret slots in without moving them. */
  hasPlaceholder?: boolean;
  /** The text of the empty column input, when `hasPlaceholder`. */
  placeholder?: string;
  /** Extra options above and below the columns, picked with `onSelectExtra`. */
  leadingGroups?: SuggestionGroup[];
  trailingGroups?: SuggestionGroup[];
  /** Extra options at the very end of the list, below the "Ask AI" option. */
  lastGroups?: SuggestionGroup[];
  onSelectExtra?: (value: string) => void;
  /** The text typed in the column step, as it changes. */
  onColumnTextChange?: (text: string) => void;
  /**
   * Runs before the pill's own keys in the column step. True stops the pill
   * and the list from handling the key.
   */
  onColumnKeyDown?: (
    event: KeyboardEvent<HTMLInputElement>,
    state: ColumnKeyState,
  ) => boolean;
  /** Called with the filter in the pill each time the user changes it. */
  onDraftChange: (
    filter: Lib.ExpressionClause | undefined,
    source: DraftChangeSource,
  ) => void;
  /** The user finished the filter. */
  onSubmit: (filter: Lib.ExpressionClause | Lib.SegmentMetadata) => void;
  /** The AI created new filters from the text of the pill. */
  /**
   * The user picked many filters at once, like from the AI. `logic` tells how
   * they combine, like "0 or 1", and is undefined when they all apply with AND.
   */
  onSubmitFilters: (filters: Lib.ExpressionClause[], logic?: string) => void;
  /** The user closed the pill and keeps what is applied. */
  onDone: () => void;
  /** The user discarded the changes in the pill. */
  onCancel: (reason: CancelReason) => void;
  /** The user removed the filter with the cross of the pill. */
  onRemove: () => void;
}

/**
 * Prototype: a filter pill that is an input. The user types or picks the
 * column, then the operator, then the values. A comma adds a value.
 */
export function DraftFilterPill({
  query,
  stageIndex,
  filter,
  initialState,
  initialEditedPart,
  initialText = "",
  hasPlaceholder = true,
  placeholder = getFilterPlaceholder(),
  leadingGroups,
  trailingGroups,
  lastGroups,
  onSelectExtra,
  onColumnTextChange,
  onColumnKeyDown,
  onDraftChange,
  onSubmit,
  onSubmitFilters,
  onDone,
  onCancel,
  onRemove,
}: DraftFilterPillProps) {
  const [draft, setDraft] = useState<DraftState>(
    () => initialState ?? { values: [] },
  );
  const [text, setText] = useState(initialText);
  // The column or the operator that the user changes in a complete filter,
  // while the other parts of the filter stay in the pill.
  const [editedPart, setEditedPart] = useState(initialEditedPart);
  const inputRef = useRef<HTMLInputElement>(null);
  const columnGroups = useMemo(
    () => getColumnGroups(query, stageIndex),
    [query, stageIndex],
  );
  const columns = useMemo(
    () => columnGroups.flatMap((group) => group.columns),
    [columnGroups],
  );
  const { column, operator, values } = draft;
  const step =
    editedPart ??
    (column == null
      ? "column"
      : column.operators == null
        ? "fallback"
        : // An operator with no values, like "is empty", is the whole filter,
          // so the pill edits the operator.
          operator == null || operator.valueKind === "none"
          ? "operator"
          : "value");

  const getFilterWithText = (draft: DraftState, text: string) => {
    const { operator, values } = draft;
    const trimmedText = text.trim();
    const canAddText =
      operator != null &&
      !isAiPrompt(trimmedText) &&
      values.length < getMaxValueCount(operator.valueKind) &&
      isValidValue(operator, trimmedText);
    return getDraftFilterClause({
      ...draft,
      values: canAddText ? [...values, trimmedText] : values,
    });
  };

  const updateDraft = (newDraft: DraftState) => {
    aiValues.reset();
    setDraft(newDraft);
    setEditedPart(undefined);
    setText("");
    onDraftChange(getDraftFilterClause(newDraft), "selection");
    inputRef.current?.focus();
  };

  const handleTextChange = (newText: string) => {
    aiValues.reset();
    aiFilters.reset();
    // A space after the name of a column or an operator, in any case, selects
    // it, the same as Tab. The symbol of a number operator, like ">=", is a
    // name too. A request to the AI is a sentence, so it keeps its spaces.
    if (newText.endsWith(" ") && !isAiPrompt(newText)) {
      if (step === "column") {
        const typedColumn = findItemByTypedName(
          columns,
          (column) => [column.label],
          newText,
        );
        if (typedColumn != null) {
          updateDraft(changeDraftColumn(draft, typedColumn));
          return;
        }
      }
      if (step === "operator") {
        const typedOperator = findItemByTypedName(
          column?.operators ?? [],
          getOperatorNames,
          newText,
        );
        if (typedOperator != null) {
          selectOperator(typedOperator);
          return;
        }
      }
    }
    if (step === "column") {
      onColumnTextChange?.(newText);
    }
    // Commas separate values. Elsewhere, the text can be a request to the AI,
    // which can have commas.
    if (step !== "value" || isAiPrompt(newText)) {
      setText(newText);
      return;
    }
    setText(newText.replace(/,/g, ""));
    onDraftChange(getFilterWithText(draft, newText), "typing");
  };

  const submit = () => {
    const filter = getFilterWithText(draft, text);
    if (filter != null) {
      onSubmit(filter);
    }
    return filter != null;
  };

  const aiValues = useAiFilterValues({
    query,
    stageIndex,
    column,
    operator,
    values,
    onValues: (newValues) => {
      const newDraft = { ...draft, values: newValues };
      setDraft(newDraft);
      setText("");
      onDraftChange(getDraftFilterClause(newDraft), "selection");
      inputRef.current?.focus();
    },
  });
  const aiFilters = useAiFilters({
    query,
    stageIndex,
    onFilters: onSubmitFilters,
  });
  // Prototype: "@" at the start of the column search switches the pill to a
  // request to the AI for new filters.
  const isAiFiltersMode =
    step === "column" && filter == null && isAiPrompt(text);
  const isAiPromptActive =
    step === "value" &&
    (isAiPrompt(text) || values.some((value) => isAiPrompt(value)));

  const latestState = useLatest({ step, submit });
  // A click outside applies the filter in the pill, when it is complete.
  const pillRef = useClickOutside(() => {
    const { step, submit } = latestState.current;
    // The fallback picker is in a portal and closes on its own.
    if (step === "fallback") {
      return;
    }
    if (!submit()) {
      onCancel("click-outside");
    }
  });

  const addValues = (rawText: string) => {
    if (operator == null) {
      return;
    }
    const maxCount = getMaxValueCount(operator.valueKind);
    // A single value is replaced, not added to.
    const keptValues = operator.valueKind === "single" ? [] : values;
    const newValues = rawText
      .split(",")
      .map((value) => value.trim())
      .filter((value) => isValidValue(operator, value))
      .filter((value) => !keptValues.includes(value));
    const allValues = [...keptValues, ...newValues].slice(0, maxCount);
    const newDraft = { ...draft, values: allValues };
    if (operator.valueKind !== "multi" && allValues.length === maxCount) {
      const filter = getDraftFilterClause(newDraft);
      if (filter != null) {
        onSubmit(filter);
        return;
      }
    }
    updateDraft(newDraft);
  };

  const toggleValue = (value: string) => {
    if (operator?.valueKind !== "multi") {
      addValues(value);
    } else if (values.includes(value)) {
      updateDraft({
        ...draft,
        values: values.filter((item) => item !== value),
      });
    } else {
      updateDraft({ ...draft, values: [...values, value] });
    }
  };

  const removeValue = (index: number) => {
    updateDraft({ ...draft, values: values.filter((_, i) => i !== index) });
  };

  const goBack = () => {
    if (step === "value" && values.length > 0) {
      removeValue(values.length - 1);
    } else if (step === "value") {
      updateDraft({ column, values: [] });
    } else if (step === "operator") {
      updateDraft({ values: [] });
    } else {
      onCancel("back");
    }
  };

  const selectOperator = (newOperator: DraftOperator) => {
    const maxCount = getMaxValueCount(newOperator.valueKind);
    const newDraft = {
      column,
      operator: newOperator,
      values: values
        .filter((value) => isValidValue(newOperator, value))
        .slice(0, maxCount),
    };
    const filter = getDraftFilterClause(newDraft);
    if (newOperator.valueKind === "none" && filter != null) {
      onSubmit(filter);
    } else {
      updateDraft(newDraft);
    }
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    hasSelectedOption: boolean,
    firstOptionValue: string | undefined,
  ) => {
    if (
      step === "column" &&
      onColumnKeyDown?.(event, { text, hasSelectedOption })
    ) {
      return true;
    }
    if (isAiFiltersMode) {
      if (event.key === "Enter") {
        aiFilters.ask(getAiPromptText(text));
        return true;
      }
      if (event.key !== "Escape" && event.key !== "Backspace") {
        return false;
      }
    }
    if (step === "value" && isAiPrompt(text)) {
      if (event.key === "Enter") {
        aiValues.ask(text);
        return true;
      }
      if (event.key !== "Escape" && event.key !== "Backspace") {
        return false;
      }
    }
    const input = event.currentTarget;
    if (
      event.key === "ArrowLeft" &&
      input.selectionStart === 0 &&
      input.selectionEnd === 0 &&
      moveToPart("previous")
    ) {
      return true;
    }
    if (
      event.key === "ArrowRight" &&
      input.selectionStart === input.value.length &&
      moveToPart("next")
    ) {
      return true;
    }
    switch (event.key) {
      case "Escape":
        // Prototype: Escape leaves an existing filter, whatever part the
        // user edits. A new filter goes back from an edited part first.
        if (editedPart != null && filter == null) {
          editPart(undefined);
        } else {
          onCancel("escape");
        }
        return true;
      case "Backspace":
        if (text.length === 0 && editedPart != null) {
          editPart(undefined);
          return true;
        }
        if (text.length === 0) {
          goBack();
          return true;
        }
        return false;
      case ",":
        if (step === "value") {
          addValues(text);
          return true;
        }
        return false;
      case "Tab":
        // Shift+Tab edits the part before, like the fields of a
        // form. From the column, it leaves the filter.
        if (event.shiftKey) {
          return moveToPart("previous");
        }
        // Prototype: in a list of checkboxes, Tab completes the filter, also
        // with a checkbox highlighted. With typed text, it picks the value.
        if (
          step === "value" &&
          operator?.valueKind === "multi" &&
          text.trim().length === 0
        ) {
          submit();
          return true;
        }
        // Tab picks the first matching value, or adds the typed text when
        // nothing matches.
        if (step === "value" && !hasSelectedOption && text.trim().length > 0) {
          if (firstOptionValue == null) {
            addValues(text);
          } else if (values.includes(firstOptionValue)) {
            setText("");
          } else {
            toggleValue(firstOptionValue);
          }
          return true;
        }
        // A highlighted option takes the Tab, the same as Enter.
        if (hasSelectedOption) {
          return false;
        }
        // With nothing to pick, Tab edits the next part. After the
        // last part, it completes the filter.
        return moveToPart("next") || submit();
      case "Enter":
        if (step === "value" && !hasSelectedOption) {
          submit();
          return true;
        }
        return false;
      default:
        return false;
    }
  };

  const setFixedValues = (newValues: string[]) => {
    const newDraft = { ...draft, values: newValues };
    setDraft(newDraft);
    onDraftChange(getDraftFilterClause(newDraft), "typing");
  };

  const handleFixedValueKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (isAiPrompt(event.currentTarget.value)) {
        aiValues.ask(event.currentTarget.value);
      } else {
        submit();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel("escape");
    } else if (
      event.key === "Backspace" &&
      index === 0 &&
      event.currentTarget.value.length === 0
    ) {
      event.preventDefault();
      editPart("operator");
    } else if (
      event.key === "ArrowLeft" &&
      event.currentTarget.selectionStart === 0 &&
      event.currentTarget.selectionEnd === 0
    ) {
      // The first input goes to the operator, the next ones to the input
      // before them.
      event.preventDefault();
      if (index === 0) {
        editPart("operator");
      } else {
        focusFixedValueInput(event.currentTarget, index - 1);
      }
    } else if (
      event.key === "ArrowRight" &&
      event.currentTarget.selectionStart === event.currentTarget.value.length
    ) {
      // The last input has nothing after it, so the key does nothing then.
      if (focusFixedValueInput(event.currentTarget, index + 1)) {
        event.preventDefault();
      }
    } else if (
      (event.key === "Tab" && !event.shiftKey) ||
      (event.key === " " && !isAiPrompt(event.currentTarget.value))
    ) {
      // Tab or Space goes to the next number, and from the last one it
      // completes the filter, the same as Enter. A number has no spaces, and
      // a Tab that left the bar would drop the filter in progress.
      if (
        focusFixedValueInput(event.currentTarget, index + 1) ||
        submit() ||
        event.key === " "
      ) {
        event.preventDefault();
      }
    }
  };

  const editPart = (part: "column" | "operator" | undefined) => {
    setEditedPart(part);
    setText("");
  };

  /**
   * Prototype: the arrow keys at the start or the end of an input edit the
   * part before or after it: the column, the operator or the values. False
   * when there is no such part, so the key does what it does by default.
   */
  const moveToPart = (direction: "previous" | "next") => {
    if (direction === "previous") {
      if (step === "operator" && column != null) {
        editPart("column");
        return true;
      }
      if (step === "value" && operator != null) {
        editPart("operator");
        return true;
      }
      return false;
    }
    if (step === "column" && operator != null) {
      editPart("operator");
      return true;
    }
    if (
      step === "operator" &&
      operator != null &&
      operator.valueKind !== "none"
    ) {
      editPart(undefined);
      return true;
    }
    return false;
  };

  const columnSegment = column != null && (
    <button
      className={`${S.segment} ${S.columnSegment}`}
      onClick={() => editPart("column")}
    >
      {column.label}
    </button>
  );

  if (step === "fallback" && column != null) {
    return (
      <Popover opened position="bottom-start" onDismiss={onDone}>
        <Popover.Target>
          <div className={S.draftPill} data-testid="draft-filter-pill">
            {columnSegment}
            <span className={S.placeholder}>…</span>
            <RemoveIcon onClick={onRemove} />
          </div>
        </Popover.Target>
        <Popover.Dropdown className={S.popover}>
          <FilterPickerBody
            query={query}
            stageIndex={stageIndex}
            column={column.column}
            filter={filter}
            isNew={filter == null}
            onChange={onSubmit}
            onBack={() => updateDraft({ values: [] })}
            onClose={onDone}
          />
        </Popover.Dropdown>
      </Popover>
    );
  }

  const aiTooltip =
    getAiFiltersTooltip(aiFilters.state, isAiFiltersMode) ??
    getAiTooltip(aiValues.state, isAiPromptActive);

  return (
    <Tooltip
      label={aiTooltip}
      opened={aiTooltip != null}
      position="top-start"
      multiline
      maw={320}
    >
      <div
        ref={pillRef}
        className={cx(S.draftPill, {
          // Only a new filter is plain text at the caret. A pill whose column
          // the user changes stays a pill. Prototype: a request to the AI is
          // a pill too, as in the Figma "AI Pill".
          [S.draftPillBare]:
            step === "column" &&
            editedPart == null &&
            !isAiFiltersMode &&
            aiFilters.state.status !== "loading" &&
            aiFilters.state.status !== "error",
          [S.draftPillLoading]: aiFilters.state.status === "loading",
          [S.draftPillError]: aiFilters.state.status === "error",
          [S.draftPillAi]: isAiFiltersMode,
        })}
        data-testid="draft-filter-pill"
      >
        <AiFiltersIcon
          status={aiFilters.state.status}
          isAiMode={isAiFiltersMode}
        />
        {step === "column" ? (
          <ColumnInput
            query={query}
            stageIndex={stageIndex}
            columnGroups={columnGroups}
            text={text}
            placeholder={column?.label ?? (hasPlaceholder ? placeholder : "")}
            onTextChange={handleTextChange}
            onSelect={(newColumn) =>
              updateDraft(changeDraftColumn(draft, newColumn))
            }
            onSelectSegment={onSubmit}
            leadingGroups={leadingGroups}
            trailingGroups={trailingGroups}
            lastGroups={lastGroups}
            onSelectExtra={onSelectExtra}
            isAiMode={isAiFiltersMode}
            // A filter that the user edits keeps its place, so the AI only
            // creates new filters.
            onAskAi={filter == null ? () => aiFilters.ask(text) : undefined}
            onKeyDown={handleKeyDown}
          />
        ) : (
          columnSegment
        )}
        {step !== "operator" &&
          operator != null &&
          !operator.hasNoPillOperator && (
            <button
              className={`${S.segment} ${S.operatorSegment}`}
              onClick={() => editPart("operator")}
            >
              {getPillOperatorLabel(operator)}
            </button>
          )}
        {step !== "operator" && operator?.pillValueLabel != null && (
          // The operator is also the value, so it looks like a value. A click
          // edits the operator, to pick another one.
          <button
            className={`${S.segment} ${S.valuesSegment}`}
            onClick={() => editPart("operator")}
          >
            <span className={S.value}>{operator.pillValueLabel}</span>
          </button>
        )}
        {step === "operator" && column?.operators != null && (
          <SuggestionInput
            inputRef={inputRef}
            groups={getOperatorGroups(column, operator)}
            // The date operators are a long list, and it fits without a
            // scrollbar.
            optionsMaxHeight={COLUMN_OPTIONS_MAX_HEIGHT}
            text={text}
            placeholder={operator?.label ?? t`Operator`}
            isFirstOptionHighlighted
            onTextChange={handleTextChange}
            onOptionSubmit={(key) => {
              const operator = column.operators?.find(
                (operator) => operator.key === key,
              );
              if (operator != null) {
                selectOperator(operator);
              }
            }}
            onKeyDown={handleKeyDown}
          />
        )}
        {step === "value" &&
          column != null &&
          operator?.datePickerType != null && (
            <DatePickerValueInput
              query={query}
              stageIndex={stageIndex}
              column={column.column}
              type={operator.datePickerType}
              specificOperator={operator.specificDateOperator}
              value={parseDatePickerValue(values[0])}
              label={
                values[0] != null ? formatDraftValue(operator, values[0]) : null
              }
              onChange={(value) => {
                const filter = operator.getFilterClause([
                  stringifyDatePickerValue(value),
                ]);
                if (filter != null) {
                  onSubmit(filter);
                }
              }}
              onBack={() => editPart("operator")}
              onCancel={() => onCancel("escape")}
              onDraftChange={(value) =>
                setFixedValues(
                  value != null ? [stringifyDatePickerValue(value)] : [],
                )
              }
            />
          )}
        {step === "value" &&
          operator != null &&
          operator.valueKind !== "date-picker" &&
          isFixedValueCount(operator) && (
            <FixedValuesInput
              query={query}
              stageIndex={stageIndex}
              column={column?.column}
              filter={filter}
              operator={operator}
              values={values}
              onChange={setFixedValues}
              onKeyDown={handleFixedValueKeyDown}
            />
          )}
        {step === "value" &&
          column != null &&
          operator != null &&
          operator.valueKind !== "date-picker" &&
          !isFixedValueCount(operator) && (
            <ValueInput
              inputRef={inputRef}
              query={query}
              stageIndex={stageIndex}
              filter={filter}
              column={column.column}
              operator={operator}
              values={values}
              text={text}
              onTextChange={handleTextChange}
              onToggleValue={toggleValue}
              onValuesChange={(newValues) =>
                updateDraft({ ...draft, values: newValues })
              }
              onKeyDown={handleKeyDown}
            />
          )}
        {step !== "value" && operator != null && (
          // The values look the same as when the user edits them.
          <DraftValueText operator={operator} values={values} />
        )}
        {aiValues.state.status === "loading" && <Loader size="xs" />}
        <RemoveIcon onClick={onRemove} />
      </div>
    </Tooltip>
  );
}

function getAiTooltip(state: AiValuesState, isAiPromptActive: boolean) {
  if (state.status === "loading") {
    return t`Asking AI…`;
  }
  if (state.status === "error") {
    return (
      <>
        {state.message}
        {state.reason && <div className={S.aiReason}>{state.reason}</div>}
      </>
    );
  }
  return isAiPromptActive ? t`Press Enter to ask AI for the values` : null;
}

function getAiFiltersTooltip(state: AiFiltersState, isAiMode: boolean) {
  if (state.status === "loading") {
    return t`Creating filters with AI…`;
  }
  if (state.status === "error") {
    return (
      <>
        {state.message}
        {state.reason && <div className={S.aiReason}>{state.reason}</div>}
      </>
    );
  }
  return isAiMode ? t`Describe the filters, then press Enter` : null;
}

/** Prototype: the icon before a request to the AI, as in the Figma "AI Pill". */
function AiFiltersIcon({
  status,
  isAiMode,
}: {
  status: AiFiltersState["status"];
  isAiMode: boolean;
}) {
  if (status === "loading") {
    return <Loader className={S.aiStatusIcon} size={12} />;
  }
  if (status === "error") {
    return (
      <Icon className={S.aiErrorIcon} name="warning_round_filled" size={12} />
    );
  }
  return isAiMode ? (
    <Icon className={S.aiModeIcon} name="ai" size={14} />
  ) : null;
}

function RemoveIcon({ onClick }: { onClick: () => void }) {
  return (
    <Icon
      className={S.removeIcon}
      name="close"
      size={12}
      role="button"
      aria-label={t`Remove filter`}
      onClick={onClick}
    />
  );
}

interface ColumnInputProps {
  query: Lib.Query;
  stageIndex: number;
  columnGroups: ColumnGroup[];
  text: string;
  placeholder: string;
  onTextChange: (text: string) => void;
  onSelect: (column: NonNullable<DraftState["column"]>) => void;
  onSelectSegment: (segment: Lib.SegmentMetadata) => void;
  leadingGroups?: SuggestionGroup[];
  trailingGroups?: SuggestionGroup[];
  lastGroups?: SuggestionGroup[];
  onSelectExtra?: (value: string) => void;
  /** The text is a request to the AI, so the pill shows no column list. */
  isAiMode: boolean;
  /** Asks the AI for filters from the text. Undefined when not available. */
  onAskAi?: () => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    hasSelectedOption: boolean,
    firstOptionValue: string | undefined,
  ) => boolean;
}

function ColumnInput({
  query,
  stageIndex,
  columnGroups,
  text,
  placeholder,
  onTextChange,
  onSelect,
  onSelectSegment,
  leadingGroups = NO_GROUPS,
  trailingGroups = NO_GROUPS,
  lastGroups = NO_GROUPS,
  onSelectExtra,
  isAiMode,
  onAskAi,
  onKeyDown,
}: ColumnInputProps) {
  const columnInputRef = useRef<HTMLInputElement>(null);
  const isLogicHintShown = useLogicOperatorsHintOnce();

  const { groups: columnSuggestionGroups, getItem } = useColumnSuggestions(
    query,
    stageIndex,
    columnGroups,
  );
  const relatedGroup = useRelatedColumnGroup(
    columnGroups,
    isAiMode ? "" : text,
  );
  const isAiAvailable = onAskAi != null;
  const groups = useMemo(() => {
    const searchGroups = [
      ...leadingGroups,
      ...columnSuggestionGroups,
      ...(relatedGroup != null ? [relatedGroup] : []),
      ...trailingGroups,
    ];
    const trimmedText = text.trim();
    if (!isAiAvailable || trimmedText.length === 0) {
      return [...searchGroups, ...lastGroups];
    }
    const aiGroup: SuggestionGroup = {
      section: t`AI`,
      isUnfiltered: true,
      options: [
        {
          value: AI_FILTERS_OPTION,
          label: t`Ask AI`,
          icon: "ai",
        },
      ],
    };
    // A sentence is likely a request, not a column name, so the AI comes
    // first. Otherwise it comes after the columns, or alone when no column
    // matches.
    return isAiFiltersPrompt(trimmedText)
      ? [aiGroup, ...searchGroups, ...lastGroups]
      : [...searchGroups, aiGroup, ...lastGroups];
  }, [
    leadingGroups,
    columnSuggestionGroups,
    relatedGroup,
    trailingGroups,
    lastGroups,
    text,
    isAiAvailable,
  ]);

  const handleSelect = (key: string) => {
    if (key === AI_FILTERS_OPTION) {
      onAskAi?.();
      return;
    }
    if (key.startsWith(EXTRA_OPTION_PREFIX)) {
      onSelectExtra?.(key);
      return;
    }
    const item = getItem(key);
    if (item?.type === "column") {
      onSelect(item.column);
    } else if (item?.type === "segment") {
      onSelectSegment(item.segment);
    }
  };

  return (
    <SuggestionInput
      groups={isAiMode ? NO_GROUPS : groups}
      inputRef={columnInputRef}
      footer={
        isAiMode || !isLogicHintShown ? undefined : <LogicOperatorsHint />
      }
      dropdownWidth={COLUMN_DROPDOWN_WIDTH}
      optionsMaxHeight={COLUMN_OPTIONS_MAX_HEIGHT}
      text={text}
      placeholder={placeholder}
      emptyMessage={t`No results`}
      onTextChange={onTextChange}
      onOptionSubmit={handleSelect}
      onKeyDown={onKeyDown}
    />
  );
}

const LOGIC_HINT_SEEN_KEY = "metabase-prototype-filter-logic-hint-seen";

/**
 * Prototype: the logic operators hint shows in the first column list of the
 * browser session only, while the user adds their first filter. The list
 * keeps it until it closes; the lists after it don't show it. The session
 * storage keeps this across page loads in the same tab.
 */
function useLogicOperatorsHintOnce() {
  const [isShown] = useState(
    () => window.sessionStorage.getItem(LOGIC_HINT_SEEN_KEY) == null,
  );
  useEffect(() => {
    if (isShown) {
      window.sessionStorage.setItem(LOGIC_HINT_SEEN_KEY, "true");
    }
  }, [isShown]);
  return isShown;
}

/**
 * Prototype: a bar under the column list that tells the user that the filter
 * bar takes AND, OR and parentheses, from the boolean expression prototype.
 */
function LogicOperatorsHint() {
  const operators = ["AND", "OR", "(", ")"];
  return (
    <Flex className={S.logicHint} align="center" gap="sm">
      <Icon name="info" size={12} />
      <span>{t`Logic operators available`}</span>
      <Flex className={S.logicHintKeys} align="center">
        {operators.map((operator, index) => (
          <Fragment key={operator}>
            {index > 0 && ", "}
            <Kbd className={S.logicHintKey}>{operator}</Kbd>
          </Fragment>
        ))}
      </Flex>
    </Flex>
  );
}

/**
 * Prototype: a "Related columns" group with the columns that match the search
 * by meaning, from the on-device model of Chrome. It leaves out the columns
 * that the normal search shows, and is empty while the model answers, so that
 * the list does not jump.
 */
function useRelatedColumnGroup(
  columnGroups: ColumnGroup[],
  text: string,
): SuggestionGroup | null {
  const entries = useMemo(
    () =>
      columnGroups.flatMap((group, groupIndex) =>
        group.columns.map((column, columnIndex) => ({
          key: `column:${groupIndex}:${columnIndex}`,
          column,
          tableLabel: group.label,
        })),
      ),
    [columnGroups],
  );
  const labels = useMemo(
    () =>
      entries.map(({ column, tableLabel }) =>
        columnGroups.length > 1
          ? `${column.label} (${tableLabel})`
          : column.label,
      ),
    [entries, columnGroups.length],
  );
  const matches = useSemanticColumnMatches(labels, text);

  return useMemo(() => {
    const searchText = text.trim().toLowerCase();
    const options = matches
      .map((index) => entries[index])
      .filter(
        (entry) =>
          entry != null &&
          !entry.column.label.toLowerCase().includes(searchText),
      )
      .map(({ key, column, tableLabel }) => ({
        value: key,
        label: column.label,
        icon: getColumnIcon(column.column),
        description: tableLabel,
      }));
    return options.length > 0
      ? { section: t`Related columns`, isUnfiltered: true, options }
      : null;
  }, [entries, matches, text]);
}

interface ValueInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause | undefined;
  column: Lib.ColumnMetadata;
  operator: DraftOperator;
  values: string[];
  text: string;
  onTextChange: (text: string) => void;
  onToggleValue: (value: string) => void;
  onValuesChange: (values: string[]) => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    hasSelectedOption: boolean,
    firstOptionValue: string | undefined,
  ) => boolean;
}

function ValueInput({
  inputRef,
  query,
  stageIndex,
  filter,
  column,
  operator,
  values,
  text,
  onTextChange,
  onToggleValue,
  onValuesChange,
  onKeyDown,
}: ValueInputProps) {
  const isAiPromptText = isAiPrompt(text);
  const hasNoDropdown = isAiPromptText || operator.hasNoValueSuggestions;
  const fieldValues = useFieldValues(query, column, hasNoDropdown ? "" : text);
  const valueCounts = useValueCounts({
    query,
    stageIndex,
    column,
    filter,
    isEnabled: hasValueShares(column, operator),
  });
  const widget = useValueWidget({
    column,
    operator,
    fieldValues,
    values,
    getShare: valueCounts.type === "counts" ? valueCounts.getShare : undefined,
    onToggleValue,
  });
  const handleOptionSubmit = (value: string) => {
    if (value !== SELECT_ALL_VALUE) {
      onToggleValue(value);
      return;
    }
    const allValues = widget.groups.flatMap((group) =>
      group.options
        .map((option) => option.value)
        .filter((value) => value !== SELECT_ALL_VALUE),
    );
    // Values that are not in the list, like typed values, stay selected.
    const isAllChecked = allValues.every((value) => values.includes(value));
    const otherValues = values.filter((value) => !allValues.includes(value));
    onValuesChange(isAllChecked ? otherValues : [...otherValues, ...allValues]);
  };
  const groups = useMemo(
    () =>
      valueCounts.type === "counts"
        ? widget.groups.map((group) => ({
            ...group,
            options: group.options.map((option) => {
              const share = valueCounts.getShare(option.value);
              return {
                ...option,
                share: {
                  value: share,
                  label: formatShare(share),
                },
              };
            }),
          }))
        : widget.groups,
    [widget.groups, valueCounts],
  );
  const labels = useMemo(
    () =>
      new Map(
        widget.groups.flatMap((group) =>
          group.options.map((option) => [option.value, option.label]),
        ),
      ),
    [widget.groups],
  );
  const isMultiSelect = operator.valueKind === "multi";
  const isRange = operator.valueKind === "range";
  const valueLabels = values.map(
    (value) => labels.get(value) ?? formatDraftValue(operator, value),
  );

  return (
    <ValueBox
      contentKey={`${values.join("\n")}\n${text}`}
      fullText={joinValueLabels(valueLabels, isRange)}
    >
      <ValueText
        labels={valueLabels}
        isRange={isRange}
        hasTrailingSeparator={isMultiSelect}
      />
      {isRange && values.length === 1 && (
        <span className={cx(S.conjunction, S.rangeConjunction)}>{t`and`}</span>
      )}
      <SuggestionInput
        inputRef={inputRef}
        groups={hasNoDropdown ? NO_GROUPS : groups}
        header={hasNoDropdown ? undefined : widget.header}
        aside={hasNoDropdown ? undefined : widget.aside}
        isTiles={widget.isTiles}
        columns={widget.columns}
        dropdownWidth={widget.dropdownWidth}
        dropdownHeight={widget.dropdownHeight}
        text={text}
        placeholder={getValuePlaceholder(operator, values)}
        isMultiSelect={isMultiSelect}
        hasTabHint={!widget.isTiles}
        emptyMessage={t`Press Enter to use “${text}”`}
        onTextChange={onTextChange}
        onOptionSubmit={handleOptionSubmit}
        onKeyDown={onKeyDown}
      />
    </ValueBox>
  );
}

/** The values of the pill while its column or its operator is edited. */
function DraftValueText({
  operator,
  values,
}: {
  operator: DraftOperator;
  values: string[];
}) {
  const isRange = operator.valueKind === "range";
  const valueLabels = values.map((value) => formatDraftValue(operator, value));
  return (
    <ValueBox
      contentKey={values.join("\n")}
      fullText={joinValueLabels(valueLabels, isRange)}
    >
      <ValueText labels={valueLabels} isRange={isRange} />
    </ValueBox>
  );
}

/**
 * Prototype: focuses the value input at `index` of the pill, like the "and"
 * end of a "between" filter, with the caret at the end. False when there is
 * no such input.
 */
function focusFixedValueInput(currentInput: HTMLInputElement, index: number) {
  const inputs = currentInput
    .closest("[data-testid='draft-filter-pill']")
    ?.querySelectorAll<HTMLInputElement>("input");
  const input = inputs?.[index];
  if (input == null) {
    return false;
  }
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  return true;
}

function isFixedValueCount(operator: DraftOperator) {
  return (
    operator.isNumeric &&
    (operator.valueKind === "single" || operator.valueKind === "range")
  );
}

interface FixedValuesInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata | undefined;
  filter: Lib.FilterClause | undefined;
  operator: DraftOperator;
  values: string[];
  onChange: (values: string[]) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>, index: number) => void;
}

/**
 * Plain inputs for operators with a fixed number of values, like "between":
 * the user edits each value in place.
 */
function FixedValuesInput({
  query,
  stageIndex,
  column,
  filter,
  operator,
  values,
  onChange,
  onKeyDown,
}: FixedValuesInputProps) {
  const count = getMaxValueCount(operator.valueKind);
  const paddedValues = Array.from(
    { length: count },
    (_, index) => values[index] ?? "",
  );
  const firstEmptyIndex = paddedValues.findIndex((value) => value === "");
  const placeholders = count === 2 ? [t`Min`, t`Max`] : [t`Number`];

  const inputs = paddedValues.map((value, index) => (
    <Fragment key={index}>
      {index === 1 && <span className={S.conjunction}>{t`and`}</span>}
      <input
        className={`${S.input} ${S.valueInput}`}
        value={value}
        placeholder={placeholders[index]}
        inputMode="decimal"
        autoFocus={index === Math.max(firstEmptyIndex, 0)}
        size={Math.max(value.length || placeholders[index].length, 1)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const newValues = [...paddedValues];
          newValues[index] = event.currentTarget.value;
          onChange(newValues);
        }}
        onKeyDown={(event) => onKeyDown(event, index)}
      />
    </Fragment>
  ));

  if (column == null) {
    return inputs;
  }

  return (
    <NumberHistogramPopover
      query={query}
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      operator={operator}
      values={paddedValues}
      onChange={onChange}
    >
      {inputs}
    </NumberHistogramPopover>
  );
}

interface NumberHistogramPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter: Lib.FilterClause | undefined;
  operator: DraftOperator;
  values: string[];
  onChange: (values: string[]) => void;
  children: ReactNode;
}

interface DatePickerValueInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  type: "specific" | "relative" | "exclude";
  specificOperator: SpecificDatePickerOperator | undefined;
  value: DatePickerValue | undefined;
  /** The value as the pill shows it, or null for a new filter. */
  label: string | null;
  onChange: (value: DatePickerValue) => void;
  onBack: () => void;
  /** Escape in the exclude list. */
  onCancel: () => void;
  /** The value of the exclude list so far, for a click outside the pill. */
  onDraftChange: (value: DatePickerValue | undefined) => void;
}

/**
 * Prototype: a date picker of the filter picker, like the fixed date range
 * picker, under the pill. Its back button goes back to the list of the date
 * operators.
 */
function DatePickerValueInput({
  query,
  stageIndex,
  column,
  type,
  specificOperator,
  value,
  label,
  onChange,
  onBack,
  onCancel,
  onDraftChange,
}: DatePickerValueInputProps) {
  const availableUnits = useMemo(
    () => getDatePickerUnits(query, stageIndex, column),
    [query, stageIndex, column],
  );
  const keyboard = useDatePickerKeyboard();
  const pickerProps = {
    availableOperators: DATE_PICKER_OPERATORS,
    availableUnits,
    onBack,
  };

  // Prototype: the exclude values are a list of the pill, like its other
  // lists, not the exclude picker of the filter picker.
  if (type === "exclude") {
    return (
      <ExcludeDateValueInput
        availableUnits={availableUnits}
        value={value}
        onChange={onChange}
        onBack={onBack}
        onCancel={onCancel}
        onDraftChange={onDraftChange}
      />
    );
  }

  return (
    <Popover opened position="bottom-start" withinPortal={false} shadow="md">
      <Popover.Target>
        <span className={`${S.segment} ${S.valuesSegment}`}>
          {label != null ? (
            <span className={S.value}>{label}</span>
          ) : (
            <span className={S.placeholder}>…</span>
          )}
        </span>
      </Popover.Target>
      <Popover.Dropdown
        ref={keyboard.ref}
        className={cx(S.datePickerDropdown, S.popover)}
        onKeyDown={keyboard.onKeyDown}
      >
        {type === "specific" && (
          <SpecificDatePicker
            {...pickerProps}
            availableOperators={
              specificOperator != null
                ? [specificOperator]
                : pickerProps.availableOperators
            }
            value={
              value?.type === "specific"
                ? value
                : specificOperator != null
                  ? getOperatorDefaultValue(specificOperator)
                  : undefined
            }
            onChange={onChange}
          />
        )}
        {type === "relative" && (
          <RelativeDatePicker
            {...pickerProps}
            availableDirections={DATE_PICKER_DIRECTIONS}
            value={value?.type === "relative" ? value : undefined}
            onChange={onChange}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * Prototype: the histogram and the slider from the filter widgets prototype,
 * under the number inputs. It shows only on fast data.
 */
function NumberHistogramPopover({
  query,
  stageIndex,
  column,
  filter,
  operator,
  values,
  onChange,
  children,
}: NumberHistogramPopoverProps) {
  const { numberOperator } = operator;
  const numberValues = values.map((value) => {
    const number = parseNumber(value);
    return typeof number === "number" ? number : null;
  });
  const { result } = useNumberColumnStats({
    query,
    stageIndex,
    column,
    filter,
  });

  return (
    <Popover
      opened={result != null && numberOperator != null}
      position="bottom-start"
      withinPortal={false}
      shadow="md"
    >
      <Popover.Target>
        <span className={S.fixedValues}>{children}</span>
      </Popover.Target>
      {result != null && numberOperator != null && (
        <Popover.Dropdown
          className={cx(S.histogramDropdown, S.popover)}
          // Clicks on the histogram keep the focus in the input.
          onMouseDown={(event) => event.preventDefault()}
        >
          <HistogramSlider
            operator={numberOperator}
            histogram={result.histogram}
            min={result.range.min}
            max={result.range.max}
            step={result.step}
            values={numberValues}
            onChange={(newValues) => onChange(newValues.map(String))}
          />
        </Popover.Dropdown>
      )}
    </Popover>
  );
}

const NO_GROUPS: SuggestionGroup[] = [];

/**
 * The operators to pick from, with a divider between the groups of the
 * operators, like the values and the empty checks of a boolean column. The
 * current operator is checked.
 */
function getOperatorGroups(
  column: DraftColumn,
  currentOperator: DraftOperator | undefined,
): SuggestionGroup[] {
  const groups: SuggestionGroup[] = [];
  let lastGroup: number | undefined;
  for (const operator of column.operators ?? []) {
    if (groups.length === 0 || operator.group !== lastGroup) {
      groups.push({ hasDivider: groups.length > 0, options: [] });
      lastGroup = operator.group;
    }
    groups[groups.length - 1].options.push({
      value: operator.key,
      label: operator.label,
      aliases: getOperatorAliases(operator),
      hint: getOperatorHint(operator),
      isChecked: operator.key === currentOperator?.key,
    });
  }
  return groups;
}

function getValuePlaceholder(operator: DraftOperator, values: string[]) {
  if (operator.valueKind === "multi" && values.length > 0) {
    return t`Add more`;
  }
  return operator.isNumeric ? t`Number` : t`Value`;
}

function useFieldValues(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  text: string,
): ValueAndLabel[] {
  const fieldInfo = useMemo(
    () => Lib.fieldValuesSearchInfo(query, column),
    [query, column],
  );
  const searchText = text.trim();
  const { data: listedValues } = useGetFieldValuesQuery(
    fieldInfo.fieldId != null && canListFieldValues(fieldInfo)
      ? fieldInfo.fieldId
      : skipToken,
  );
  const { data: foundValues } = useSearchFieldValuesQuery(
    fieldInfo.fieldId != null &&
      fieldInfo.searchFieldId != null &&
      canSearchFieldValues(fieldInfo) &&
      searchText.length > 0
      ? {
          fieldId: fieldInfo.fieldId,
          searchFieldId: fieldInfo.searchFieldId,
          value: searchText,
          limit: SEARCH_LIMIT,
        }
      : skipToken,
  );

  return useMemo(() => {
    const rows = listedValues?.values ?? foundValues ?? [];
    return rows
      .filter(([value]) => value != null)
      .map(
        ([value, label]): ValueAndLabel => [
          String(value),
          String(label ?? value),
        ],
      );
  }, [listedValues, foundValues]);
}
