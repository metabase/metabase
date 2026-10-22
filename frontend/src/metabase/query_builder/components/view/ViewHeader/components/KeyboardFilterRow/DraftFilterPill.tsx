import { useClickOutside } from "@mantine/hooks";
import { skipToken } from "@reduxjs/toolkit/query/react";
import type { KeyboardEvent, ReactNode } from "react";
import { Fragment, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  useGetFieldValuesQuery,
  useSearchFieldValuesQuery,
} from "metabase/api";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import {
  canListFieldValues,
  canSearchFieldValues,
} from "metabase/querying/filters/components/FilterPicker/FilterValuePicker/utils";
import { HistogramSlider } from "metabase/querying/filters/components/FilterPicker/NumberFilterPicker/HistogramSlider";
import { useNumberColumnStats } from "metabase/querying/filters/components/FilterPicker/NumberFilterPicker/NumberColumnStats";
import { Icon, Popover } from "metabase/ui";
import { parseNumber } from "metabase/utils/number";
import * as Lib from "metabase-lib";

import S from "./KeyboardFilterRow.module.css";
import { SuggestionInput } from "./SuggestionInput";
import type { DraftOperator, DraftState } from "./types";
import {
  changeDraftColumn,
  formatDraftValue,
  getColumnGroups,
  getColumnKey,
  getColumnSuggestionGroups,
  getDraftFilterClause,
  getMaxValueCount,
  getPillOperatorLabel,
  isValidValue,
} from "./utils";
import { type ValueAndLabel, useValueWidget } from "./value-widgets";

const SEARCH_LIMIT = 20;

export type DraftChangeSource = "selection" | "typing";

interface DraftFilterPillProps {
  query: Lib.Query;
  stageIndex: number;
  /** The filter that the pill edits, or undefined for a new filter. */
  filter?: Lib.FilterClause;
  initialState?: DraftState;
  /** The part of the filter to edit first, or undefined for the values. */
  initialEditedPart?: "column" | "operator";
  isClickOutsideApply: boolean;
  /** Called with the filter in the pill each time the user changes it. */
  onDraftChange: (
    filter: Lib.ExpressionClause | undefined,
    source: DraftChangeSource,
  ) => void;
  /** The user finished the filter. */
  onSubmit: (filter: Lib.ExpressionClause) => void;
  /** The user closed the pill and keeps what is applied. */
  onDone: () => void;
  /** The user discarded the changes in the pill. */
  onCancel: () => void;
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
  isClickOutsideApply,
  onDraftChange,
  onSubmit,
  onDone,
  onCancel,
}: DraftFilterPillProps) {
  const [draft, setDraft] = useState<DraftState>(
    () => initialState ?? { values: [] },
  );
  const [text, setText] = useState("");
  // The column or the operator that the user changes in a complete filter,
  // while the other parts of the filter stay in the pill.
  const [editedPart, setEditedPart] = useState(initialEditedPart);
  const inputRef = useRef<HTMLInputElement>(null);
  const { column, operator, values } = draft;
  const step =
    editedPart ??
    (column == null
      ? "column"
      : column.operators == null
        ? "fallback"
        : operator == null
          ? "operator"
          : "value");

  const getFilterWithText = (draft: DraftState, text: string) => {
    const { operator, values } = draft;
    const trimmedText = text.trim();
    const canAddText =
      operator != null &&
      values.length < getMaxValueCount(operator.valueKind) &&
      isValidValue(operator, trimmedText);
    return getDraftFilterClause({
      ...draft,
      values: canAddText ? [...values, trimmedText] : values,
    });
  };

  const updateDraft = (newDraft: DraftState) => {
    setDraft(newDraft);
    setEditedPart(undefined);
    setText("");
    onDraftChange(getDraftFilterClause(newDraft), "selection");
    inputRef.current?.focus();
  };

  const handleTextChange = (newText: string) => {
    setText(newText.replace(/,/g, ""));
    if (step === "value") {
      onDraftChange(getFilterWithText(draft, newText), "typing");
    }
  };

  const submit = () => {
    const filter = getFilterWithText(draft, text);
    if (filter != null) {
      onSubmit(filter);
    }
    return filter != null;
  };

  const latestState = useLatest({ step, isClickOutsideApply, submit });
  const pillRef = useClickOutside(() => {
    const { step, isClickOutsideApply, submit } = latestState.current;
    // The fallback picker is in a portal and closes on its own.
    if (step === "fallback") {
      return;
    }
    if (!isClickOutsideApply || !submit()) {
      onCancel();
    }
  });

  const addValues = (rawText: string) => {
    if (operator == null) {
      return;
    }
    const maxCount = getMaxValueCount(operator.valueKind);
    const newValues = rawText
      .split(",")
      .map((value) => value.trim())
      .filter((value) => isValidValue(operator, value))
      .filter((value) => !values.includes(value));
    const allValues = [...values, ...newValues].slice(0, maxCount);
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
      onCancel();
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
    switch (event.key) {
      case "Escape":
        if (editedPart != null) {
          editPart(undefined);
        } else {
          onCancel();
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
        return false;
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
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (
      event.key === "Backspace" &&
      index === 0 &&
      event.currentTarget.value.length === 0
    ) {
      event.preventDefault();
      editPart("operator");
    }
  };

  const editPart = (part: "column" | "operator" | undefined) => {
    setEditedPart(part);
    setText("");
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
            <RemoveIcon onClick={onCancel} />
          </div>
        </Popover.Target>
        <Popover.Dropdown>
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

  return (
    <div ref={pillRef} className={S.draftPill} data-testid="draft-filter-pill">
      {step === "column" ? (
        <ColumnInput
          query={query}
          stageIndex={stageIndex}
          text={text}
          placeholder={column?.label ?? t`Column`}
          onTextChange={handleTextChange}
          onSelect={(newColumn) =>
            updateDraft(changeDraftColumn(draft, newColumn))
          }
          onKeyDown={handleKeyDown}
        />
      ) : (
        columnSegment
      )}
      {step !== "operator" && operator != null && (
        <button
          className={`${S.segment} ${S.operatorSegment}`}
          onClick={() => editPart("operator")}
        >
          {getPillOperatorLabel(operator)}
        </button>
      )}
      {step === "operator" && column?.operators != null && (
        <SuggestionInput
          inputRef={inputRef}
          groups={[
            {
              options: column.operators.map((operator) => ({
                value: operator.key,
                label: operator.label,
              })),
            },
          ]}
          text={text}
          placeholder={operator?.label ?? t`Operator`}
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
      {step === "value" && operator != null && isFixedValueCount(operator) && (
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
        !isFixedValueCount(operator) && (
          <ValueInput
            inputRef={inputRef}
            query={query}
            column={column.column}
            operator={operator}
            values={values}
            text={text}
            onTextChange={handleTextChange}
            onToggleValue={toggleValue}
            onValuesChange={(newValues) =>
              updateDraft({ ...draft, values: newValues })
            }
            onRemoveValue={removeValue}
            onKeyDown={handleKeyDown}
          />
        )}
      {step !== "value" && operator != null && (
        <ValueTokens values={values} operator={operator} />
      )}
      <RemoveIcon onClick={onCancel} />
    </div>
  );
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
  text: string;
  placeholder: string;
  onTextChange: (text: string) => void;
  onSelect: (column: NonNullable<DraftState["column"]>) => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    hasSelectedOption: boolean,
    firstOptionValue: string | undefined,
  ) => boolean;
}

function ColumnInput({
  query,
  stageIndex,
  text,
  placeholder,
  onTextChange,
  onSelect,
  onKeyDown,
}: ColumnInputProps) {
  const columnGroups = useMemo(
    () => getColumnGroups(query, stageIndex),
    [query, stageIndex],
  );
  const suggestionGroups = useMemo(
    () => getColumnSuggestionGroups(columnGroups),
    [columnGroups],
  );

  const handleSelect = (key: string) => {
    columnGroups.forEach((group, groupIndex) =>
      group.columns.forEach((column, columnIndex) => {
        if (getColumnKey(groupIndex, columnIndex) === key) {
          onSelect(column);
        }
      }),
    );
  };

  return (
    <SuggestionInput
      groups={suggestionGroups}
      text={text}
      placeholder={placeholder}
      onTextChange={onTextChange}
      onOptionSubmit={handleSelect}
      onKeyDown={onKeyDown}
    />
  );
}

interface ValueInputProps {
  inputRef: React.RefObject<HTMLInputElement>;
  query: Lib.Query;
  column: Lib.ColumnMetadata;
  operator: DraftOperator;
  values: string[];
  text: string;
  onTextChange: (text: string) => void;
  onToggleValue: (value: string) => void;
  onValuesChange: (values: string[]) => void;
  onRemoveValue: (index: number) => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    hasSelectedOption: boolean,
    firstOptionValue: string | undefined,
  ) => boolean;
}

function ValueInput({
  inputRef,
  query,
  column,
  operator,
  values,
  text,
  onTextChange,
  onToggleValue,
  onValuesChange,
  onRemoveValue,
  onKeyDown,
}: ValueInputProps) {
  const { fieldValues, isListed } = useFieldValues(query, column, text);
  const widget = useValueWidget({
    column,
    operator,
    fieldValues,
    isListed,
    values,
    onValuesChange,
    onToggleValue,
  });
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

  return (
    <>
      <ValueTokens
        values={values}
        operator={operator}
        labels={labels}
        onRemoveValue={onRemoveValue}
      />
      {isRange && values.length === 1 && (
        <span className={S.conjunction}>{t`and`}</span>
      )}
      <SuggestionInput
        inputRef={inputRef}
        groups={widget.groups}
        header={widget.header}
        isTiles={widget.isTiles}
        columns={widget.columns}
        dropdownWidth={widget.dropdownWidth}
        text={text}
        placeholder={getValuePlaceholder(operator, values)}
        isMultiSelect={isMultiSelect}
        emptyMessage={t`Press Enter to use “${text}”`}
        onTextChange={onTextChange}
        onOptionSubmit={onToggleValue}
        onKeyDown={onKeyDown}
      />
    </>
  );
}

interface ValueTokensProps {
  values: string[];
  operator: DraftOperator;
  labels?: Map<string, string>;
  onRemoveValue?: (index: number) => void;
}

function ValueTokens({
  values,
  operator,
  labels,
  onRemoveValue,
}: ValueTokensProps) {
  const isRange = operator.valueKind === "range";
  return values.map((value, index) => (
    <Fragment key={value}>
      {isRange && index === 1 && (
        <span className={S.conjunction}>{t`and`}</span>
      )}
      <span className={S.token}>
        {labels?.get(value) ?? formatDraftValue(operator, value)}
        {onRemoveValue != null && (
          <Icon
            name="close"
            size={8}
            role="button"
            aria-label={t`Remove value`}
            onClick={() => onRemoveValue(index)}
          />
        )}
      </span>
    </Fragment>
  ));
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

/**
 * Prototype: the histogram and the slider from the filter widgets prototype,
 * under the number inputs. It shows for the fast prototype tables only.
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
  const { result } = useNumberColumnStats({
    query,
    stageIndex,
    column,
    filter,
  });
  const { numberOperator } = operator;

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
          className={S.histogramDropdown}
          // Clicks on the histogram keep the focus in the input.
          onMouseDown={(event) => event.preventDefault()}
        >
          <HistogramSlider
            operator={numberOperator}
            histogram={result.histogram}
            min={result.range.min}
            max={result.range.max}
            step={result.step}
            values={values.map((value) => {
              const number = parseNumber(value);
              return typeof number === "number" ? number : null;
            })}
            onChange={(newValues) => onChange(newValues.map(String))}
          />
        </Popover.Dropdown>
      )}
    </Popover>
  );
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
): { fieldValues: ValueAndLabel[]; isListed: boolean } {
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
    return {
      fieldValues: rows
        .filter(([value]) => value != null)
        .map(
          ([value, label]): ValueAndLabel => [
            String(value),
            String(label ?? value),
          ],
        ),
      isListed: listedValues != null,
    };
  }, [listedValues, foundValues]);
}
