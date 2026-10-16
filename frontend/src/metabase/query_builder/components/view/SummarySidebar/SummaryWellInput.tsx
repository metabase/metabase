import { useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { hasFeature } from "metabase/databases";
import { Combobox, Icon, TextInput, useCombobox } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { SummaryFormulaEditor } from "./SummaryFormulaEditor";
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

/** The item whose formula the well's input is editing, and the name it starts with. */
export type SummaryFormulaEdit = {
  itemId: string;
  name: string;
};

type SummaryWellInputProps = {
  base: SummaryBase;
  database: Database | undefined;
  wellId: SummaryWellId;
  definition: SummaryDefinition;
  formulaEdit: SummaryFormulaEdit | null;
  onChange: (definition: SummaryDefinition) => void;
  onFormulaEditEnd: () => void;
};

/**
 * A well's typeahead: finds metrics (Values) or columns (Rows, Columns) by name, and turns into a
 * formula editor when the text starts with `=`, for custom aggregations and custom columns.
 * While `formulaEdit` is set, it edits that item's formula instead.
 */
export function SummaryWellInput({
  base,
  database,
  wellId,
  definition,
  formulaEdit,
  onChange,
  onFormulaEditEnd,
}: SummaryWellInputProps) {
  const [newFormulaSource, setNewFormulaSource] = useState<string | null>(null);
  const isValues = wellId === "values";
  const expressionMode = isValues ? "aggregation" : "expression";
  const canWriteFormula =
    database != null &&
    hasFeature(database, isValues ? "expression-aggregations" : "expressions");
  const formulaPlaceholder = isValues
    ? t`Aggregate with a formula, or type / to search`
    : t`Group by a formula, or type / to search`;

  if (formulaEdit != null) {
    const formulaEditClause = getFormulaClause(
      base,
      definition,
      formulaEdit.itemId,
    );
    return (
      <SummaryFormulaEditor
        key={formulaEdit.itemId}
        base={base}
        database={database}
        expressionMode={expressionMode}
        initialClause={formulaEditClause}
        initialName={formulaEdit.name}
        placeholder={formulaPlaceholder}
        submitLabel={t`Update`}
        onSubmit={(expression) => {
          onChange(
            replaceWithExpression(definition, formulaEdit.itemId, expression),
          );
          onFormulaEditEnd();
        }}
        onCancel={onFormulaEditEnd}
      />
    );
  }

  if (newFormulaSource != null) {
    const handleAdd = (expression: SummaryExpression) => {
      onChange(
        wellId === "values"
          ? addExpressionValue(definition, expression)
          : addExpressionDimension(definition, wellId, expression),
      );
      setNewFormulaSource(null);
    };

    return (
      <SummaryFormulaEditor
        base={base}
        database={database}
        expressionMode={expressionMode}
        initialSource={newFormulaSource}
        placeholder={formulaPlaceholder}
        submitLabel={t`Add`}
        onSubmit={handleAdd}
        onCancel={() => setNewFormulaSource(null)}
      />
    );
  }

  return (
    <SummaryWellSearch
      base={base}
      wellId={wellId}
      definition={definition}
      canWriteFormula={canWriteFormula}
      onChange={onChange}
      onStartFormula={setNewFormulaSource}
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

function getSearchPlaceholder(isValues: boolean, canWriteFormula: boolean) {
  if (isValues) {
    return canWriteFormula
      ? t`Type a metric name, or = for a formula…`
      : t`Type a metric name…`;
  }
  return canWriteFormula
    ? t`Type a column name, or = for a formula…`
    : t`Type a column name…`;
}

type SummaryWellSearchProps = {
  base: SummaryBase;
  wellId: SummaryWellId;
  definition: SummaryDefinition;
  canWriteFormula: boolean;
  onChange: (definition: SummaryDefinition) => void;
  onStartFormula: (source: string) => void;
};

function SummaryWellSearch({
  base,
  wellId,
  definition,
  canWriteFormula,
  onChange,
  onStartFormula,
}: SummaryWellSearchProps) {
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

  const searchPlaceholder = getSearchPlaceholder(isValues, canWriteFormula);

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
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.Target>
        <TextInput
          size="sm"
          placeholder={searchPlaceholder}
          leftSection={<Icon name={isValues ? "metric" : "table"} />}
          value={searchText}
          aria-label={
            isValues ? t`Add a value by name` : t`Add a grouping by name`
          }
          data-testid={`summary-well-input-${wellId}`}
          onChange={(event) => handleSearchChange(event.currentTarget.value)}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
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
