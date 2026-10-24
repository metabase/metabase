import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { getColumnIcon } from "metabase/common/utils/columns";
import { hasFeature } from "metabase/databases";
import {
  Box,
  Combobox,
  Icon,
  Kbd,
  PillsInput,
  Text,
  useCombobox,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database, IconName } from "metabase-types/api";

import type {
  SummaryBase,
  SummaryDefinition,
  SummaryExpression,
  SummaryWellId,
} from "../../../../components/view/SummarySidebar/types";
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
  removeItem,
  replaceWithExpression,
} from "../../../../components/view/SummarySidebar/utils";

import { MatchedLabel } from "./MatchedLabel";
import { SummaryFormulaEditor } from "./SummaryFormulaEditor";
import S from "./SummarySidebar.module.css";

const FORMULA_PREFIX = "=";
const FORMULA_OPTION_VALUE = "formula";
const DROPDOWN_GAP_PX = 4;
const DROPDOWN_MAX_HEIGHT_PX = 320;

/** Where the typeahead sits relative to its field, so it lines up with the well card instead. */
type DropdownFrame = {
  position: "bottom-start" | "top-start";
  width: number;
  offset: { mainAxis: number; crossAxis: number };
};

/**
 * Opens below the card, or above it when there's more room there. The side is picked here rather
 * than by flipping, because the offset that clears the card differs per side.
 * The card is the field's parent; `null` if the field isn't mounted in one.
 */
function getCardFrame(field: HTMLElement): DropdownFrame | null {
  const card = field.parentElement;
  if (card == null) {
    return null;
  }
  const fieldRect = field.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const spaceBelow = window.innerHeight - cardRect.bottom;
  const isBelow =
    spaceBelow >= DROPDOWN_MAX_HEIGHT_PX || spaceBelow >= cardRect.top;
  return {
    position: isBelow ? "bottom-start" : "top-start",
    width: cardRect.width,
    offset: {
      mainAxis:
        (isBelow
          ? cardRect.bottom - fieldRect.bottom
          : fieldRect.top - cardRect.top) + DROPDOWN_GAP_PX,
      crossAxis: cardRect.left - fieldRect.left,
    },
  };
}

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
  /** The well's chips, laid out inline before the field. */
  children: ReactNode;
  onChange: (definition: SummaryDefinition) => void;
  onFormulaEditEnd: () => void;
};

/**
 * A well's field: its chips followed by a typeahead that finds metrics (Values) or columns
 * (Rows, Columns) by name, and turns into a formula editor when the text starts with `=`,
 * for custom aggregations and custom columns. While `formulaEdit` is set, it edits that
 * item's formula instead.
 */
export function SummaryWellInput({
  base,
  database,
  wellId,
  definition,
  formulaEdit,
  children,
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
      <Box className={S.wellField}>
        {children}
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
      </Box>
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
      <Box className={S.wellField}>
        {children}
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
      </Box>
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
    >
      {children}
    </SummaryWellSearch>
  );
}

type SummarySearchOption = {
  value: string;
  label: string;
  icon: IconName;
  description?: string;
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
          icon: getColumnIcon(column),
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

  const metricOptions = getAvailableMetrics(base, searchText).map(
    (metric): SummarySearchOption => ({
      value: getItemKey(base, metric),
      label: getMetricLabel(base, metric),
      icon: "metric",
      description: Lib.displayInfo(base.query, base.stageIndex, metric)
        .description,
      group: t`Associated metrics`,
      apply: (definition: SummaryDefinition) =>
        addMetricValue(base, definition, metric),
    }),
  );
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
          icon: "sum",
          group: t`Basic`,
          apply: addCountValue,
        },
      ]
    : metricOptions;
}

function getSearchPlaceholder({
  isValues,
  hasItems,
}: {
  isValues: boolean;
  hasItems: boolean;
}) {
  if (hasItems) {
    return isValues ? t`Add a value…` : t`Add a column…`;
  }
  // the half-width wells have no room for the "= for a formula" hint; typing = still starts one
  return isValues ? t`Drag or type a metric` : t`Drag or type a column`;
}

type SummaryWellSearchProps = {
  base: SummaryBase;
  wellId: SummaryWellId;
  definition: SummaryDefinition;
  canWriteFormula: boolean;
  children: ReactNode;
  onChange: (definition: SummaryDefinition) => void;
  onStartFormula: (source: string) => void;
};

function SummaryWellSearch({
  base,
  wellId,
  definition,
  canWriteFormula,
  children,
  onChange,
  onStartFormula,
}: SummaryWellSearchProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [dropdownFrame, setDropdownFrame] = useState<DropdownFrame | null>(
    null,
  );
  const combobox = useCombobox({
    onDropdownOpen: () =>
      setDropdownFrame(fieldRef.current && getCardFrame(fieldRef.current)),
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

  const wellItems =
    wellId === "values" ? definition.values : definition[wellId];
  const searchPlaceholder = getSearchPlaceholder({
    isValues,
    hasItems: wellItems.length > 0,
  });

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

  // the typeahead waits for the first character, so focusing a well doesn't cover the wells below
  const handleSearchChange = (text: string) => {
    if (canWriteFormula && text.startsWith(FORMULA_PREFIX)) {
      setSearchText("");
      combobox.closeDropdown();
      onStartFormula(text.slice(FORMULA_PREFIX.length));
      return;
    }
    setSearchText(text);
    if (text.trim().length > 0) {
      combobox.openDropdown();
    } else {
      combobox.closeDropdown();
    }
  };

  // like any pills input, Backspace in an empty field takes off the last chip
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const lastItem = wellItems[wellItems.length - 1];
    if (event.key === "Backspace" && searchText.length === 0 && lastItem) {
      event.preventDefault();
      onChange(removeItem(definition, lastItem.id));
    }
  };

  return (
    <Combobox
      store={combobox}
      position={dropdownFrame?.position ?? "bottom-start"}
      middlewares={{ flip: dropdownFrame == null, shift: true }}
      width={dropdownFrame?.width ?? "target"}
      offset={dropdownFrame?.offset ?? DROPDOWN_GAP_PX}
      radius="md"
      shadow="sm_outline"
      classNames={{
        dropdown: S.searchDropdown,
        options: S.searchOptions,
        option: S.searchOption,
        groupLabel: S.searchGroupLabel,
        empty: S.searchEmpty,
      }}
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.DropdownTarget>
        <Box ref={fieldRef} className={S.wellField}>
          {children}
          <Combobox.EventsTarget>
            <PillsInput.Field
              className={S.wellFieldInput}
              placeholder={searchPlaceholder}
              value={searchText}
              aria-label={
                isValues ? t`Add a value by name` : t`Add a grouping by name`
              }
              data-testid={`summary-well-input-${wellId}`}
              onChange={(event) =>
                handleSearchChange(event.currentTarget.value)
              }
              onKeyDown={handleKeyDown}
              onBlur={() => combobox.closeDropdown()}
            />
          </Combobox.EventsTarget>
        </Box>
      </Combobox.DropdownTarget>
      <Combobox.Dropdown>
        <Combobox.Options
          mah={DROPDOWN_MAX_HEIGHT_PX}
          style={{ overflowY: "auto" }}
        >
          {options.length === 0 && (
            <Combobox.Empty>
              {isValues ? t`No matching metrics` : t`No matching columns`}
            </Combobox.Empty>
          )}
          {optionGroups.map(([group, groupOptions]) => (
            <Combobox.Group key={group} label={group}>
              {groupOptions.map((option) => (
                <Combobox.Option key={option.value} value={option.value}>
                  <Icon
                    name={option.icon}
                    className={S.searchOptionIcon}
                    aria-hidden
                  />
                  <Box className={S.searchOptionText}>
                    <MatchedLabel label={option.label} query={searchText} />
                    {option.description && (
                      <Text className={S.searchOptionDescription} truncate>
                        {option.description}
                      </Text>
                    )}
                  </Box>
                </Combobox.Option>
              ))}
            </Combobox.Group>
          ))}
          {canWriteFormula && (
            <Combobox.Group label={t`Formula`}>
              <Combobox.Option value={FORMULA_OPTION_VALUE}>
                <Icon
                  name="function"
                  className={S.searchOptionIcon}
                  aria-hidden
                />
                <Box className={S.searchOptionText}>
                  {isValues ? t`Custom aggregation` : t`Custom column`}
                </Box>
                <Kbd>{FORMULA_PREFIX}</Kbd>
              </Combobox.Option>
            </Combobox.Group>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
