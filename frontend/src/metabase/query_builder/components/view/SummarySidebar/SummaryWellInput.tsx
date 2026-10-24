import { type Ref, useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { hasFeature } from "metabase/databases";
import { Combobox, TextInput, useCombobox } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { SummaryFormulaEditor } from "./SummaryFormulaEditor";
import S from "./SummarySidebar.module.css";
import type {
  SummaryBase,
  SummaryDefinition,
  SummaryExpression,
  SummaryWellId,
} from "./types";
import {
  addCountValue,
  addExpressionDimension,
  addExpressionValue,
  addMetricValue,
  dropOnWell,
  getAvailableMetrics,
  getColumnLabel,
  getColumnSections,
  getFormulaClause,
  getItemKey,
  getMetricLabel,
  replaceWithExpression,
} from "./utils";

const FORMULA_PREFIX = "=";
const FORMULA_OPTION_VALUE = "formula";

/** The item whose formula is being edited, and the name it starts with. */
export type SummaryFormulaEdit = {
  itemId: string;
  name: string;
};

/** Values aggregate with formulas, Rows and Columns group by custom columns written as formulas. */
export function canWriteWellFormula(
  database: Database | undefined,
  wellId: SummaryWellId,
) {
  return (
    database != null &&
    hasFeature(
      database,
      wellId === "values" ? "expression-aggregations" : "expressions",
    )
  );
}

type SummaryWellFormulaProps = {
  base: SummaryBase;
  database: Database | undefined;
  wellId: SummaryWellId;
  definition: SummaryDefinition;
  /** Set to edit an item's formula; otherwise the formula is added to the well. */
  formulaEdit: SummaryFormulaEdit | null;
  /** What was typed after `=` in the well's input, for a new formula. */
  initialSource: string;
  onChange: (definition: SummaryDefinition) => void;
  onEnd: () => void;
};

/** The formula editor for a well: adds a custom aggregation (Values) or custom column (Rows, Columns), or edits one. */
export function SummaryWellFormula({
  base,
  database,
  wellId,
  definition,
  formulaEdit,
  initialSource,
  onChange,
  onEnd,
}: SummaryWellFormulaProps) {
  const isValues = wellId === "values";
  const expressionMode = isValues ? "aggregation" : "expression";
  const placeholder = isValues
    ? t`Aggregate with a formula, or type / to search`
    : t`Group by a formula, or type / to search`;

  if (formulaEdit != null) {
    return (
      <SummaryFormulaEditor
        key={formulaEdit.itemId}
        base={base}
        database={database}
        expressionMode={expressionMode}
        initialClause={getFormulaClause(base, definition, formulaEdit.itemId)}
        initialName={formulaEdit.name}
        placeholder={placeholder}
        submitLabel={t`Update`}
        onSubmit={(expression) => {
          onChange(
            replaceWithExpression(definition, formulaEdit.itemId, expression),
          );
          onEnd();
        }}
        onCancel={onEnd}
      />
    );
  }

  const handleAdd = (expression: SummaryExpression) => {
    onChange(
      wellId === "values"
        ? addExpressionValue(definition, expression)
        : addExpressionDimension(definition, wellId, expression),
    );
    onEnd();
  };

  return (
    <SummaryFormulaEditor
      key={wellId}
      base={base}
      database={database}
      expressionMode={expressionMode}
      initialSource={initialSource}
      placeholder={placeholder}
      submitLabel={t`Add`}
      onSubmit={handleAdd}
      onCancel={onEnd}
    />
  );
}

type SummarySearchOption = {
  value: string;
  label: string;
  group: string;
  apply: (definition: SummaryDefinition) => SummaryDefinition;
};

function getSearchOptions(
  base: SummaryBase,
  wellId: SummaryWellId,
  searchText: string,
): SummarySearchOption[] {
  if (wellId !== "values") {
    return getColumnSections(base, searchText).flatMap((section) =>
      section.columns.map((column) => {
        const label = getColumnLabel(base, column);
        return {
          value: getItemKey(base, column),
          label,
          group: section.name,
          apply: (definition: SummaryDefinition) =>
            dropOnWell(
              base,
              definition,
              { kind: "column", column, label },
              wellId,
            ),
        };
      }),
    );
  }

  const metricOptions = getAvailableMetrics(base, searchText).map((metric) => ({
    value: getItemKey(base, metric),
    label: getMetricLabel(base, metric),
    group: t`Associated metrics`,
    apply: (definition: SummaryDefinition) =>
      addMetricValue(base, definition, metric),
  }));
  const countLabel = t`Count of rows`;
  const hasCountOption = countLabel
    .toLowerCase()
    .includes(searchText.trim().toLowerCase());
  return hasCountOption
    ? [
        ...metricOptions,
        {
          value: "count",
          label: countLabel,
          group: t`Basic`,
          apply: addCountValue,
        },
      ]
    : metricOptions;
}

function getPlaceholder(isValues: boolean, isEmpty: boolean) {
  if (!isEmpty) {
    return t`Add…`;
  }
  return isValues ? t`Type or drop a metric` : t`Type or drop a column`;
}

type SummaryWellInputProps = {
  base: SummaryBase;
  wellId: SummaryWellId;
  definition: SummaryDefinition;
  isEmpty: boolean;
  /** Overrides the default placeholder while the well is empty. */
  emptyPlaceholder?: string;
  canWriteFormula: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (definition: SummaryDefinition) => void;
  onStartFormula: (source: string) => void;
  /** Backspace in the empty input, like in a token field. */
  onRemoveLast: () => void;
};

/**
 * The text input inside a well, after its chips: finds metrics (Values) or columns (Rows, Columns)
 * by name, and starts a formula when the text starts with `=`.
 */
export function SummaryWellInput({
  base,
  wellId,
  definition,
  isEmpty,
  emptyPlaceholder,
  canWriteFormula,
  inputRef,
  onChange,
  onStartFormula,
  onRemoveLast,
}: SummaryWellInputProps) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const [searchText, setSearchText] = useState("");
  const isValues = wellId === "values";

  const options = useMemo(
    () => getSearchOptions(base, wellId, searchText),
    [base, wellId, searchText],
  );
  // highlight the best match once the filtered options render, so Enter picks it
  // rather than whatever sat first in the previous list
  const comboboxRef = useLatest(combobox);
  useEffect(() => {
    if (searchText.length > 0) {
      comboboxRef.current.selectFirstOption();
    }
  }, [comboboxRef, options, searchText]);

  const optionGroups = useMemo(
    () => Object.entries(_.groupBy(options, (option) => option.group)),
    [options],
  );

  const handleOptionSubmit = (optionValue: string) => {
    setSearchText("");
    combobox.closeDropdown();
    if (optionValue === FORMULA_OPTION_VALUE) {
      onStartFormula("");
      return;
    }
    const option = options.find(({ value }) => value === optionValue);
    if (option) {
      onChange(option.apply(definition));
    }
  };

  const handleSearchChange = (text: string) => {
    if (canWriteFormula && text.startsWith(FORMULA_PREFIX)) {
      setSearchText("");
      combobox.closeDropdown();
      onStartFormula(text.slice(FORMULA_PREFIX.length));
      return;
    }
    setSearchText(text);
    combobox.openDropdown();
  };

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      width={260}
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.Target>
        <TextInput
          ref={inputRef}
          className={S.wellInput}
          variant="unstyled"
          size="xs"
          placeholder={
            (isEmpty ? emptyPlaceholder : undefined) ??
            getPlaceholder(isValues, isEmpty)
          }
          value={searchText}
          aria-label={
            isValues ? t`Add a value by name` : t`Add a grouping by name`
          }
          data-testid={`summary-well-input-${wellId}`}
          onChange={(event) => handleSearchChange(event.currentTarget.value)}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && searchText.length === 0) {
              onRemoveLast();
            }
          }}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options mah={280} style={{ overflowY: "auto" }}>
          {optionGroups.map(([group, groupOptions]) => (
            <Combobox.Group key={group} label={group}>
              {groupOptions.map((option) => (
                <Combobox.Option key={option.value} value={option.value}>
                  {option.label}
                </Combobox.Option>
              ))}
            </Combobox.Group>
          ))}
          {canWriteFormula && (
            <Combobox.Group label={t`Formula`}>
              <Combobox.Option value={FORMULA_OPTION_VALUE}>
                {isValues ? t`Custom aggregation… (=)` : t`Custom column… (=)`}
              </Combobox.Option>
            </Combobox.Group>
          )}
          {options.length === 0 && !canWriteFormula && (
            <Combobox.Empty>
              {isValues ? t`No matching metrics` : t`No matching columns`}
            </Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
