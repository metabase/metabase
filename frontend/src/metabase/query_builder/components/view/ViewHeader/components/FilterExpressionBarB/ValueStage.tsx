import type { EditorView } from "@tiptap/pm/view";
import { t } from "ttag";

import { HistogramSlider } from "metabase/querying/filters/components/FilterPicker/NumberFilterPicker/HistogramSlider";
import {
  MatchCount,
  SampleNote,
  UnavailableNote,
  useNumberColumnStats,
  useValueCounts,
} from "metabase/querying/filters/components/FilterPicker/NumberFilterPicker/NumberColumnStats";
import { Loader } from "metabase/ui";

import {
  getValueCountsFooter,
  useFieldValues,
} from "../KeyboardFilterRow/DraftFilterPill";
import { useAiFilterValues } from "../KeyboardFilterRow/ai-filter-values";
import {
  SELECT_ALL_VALUE,
  formatShare,
  hasValueShares,
  useValueWidget,
} from "../KeyboardFilterRow/value-widgets";

import BS from "./FilterExpressionBarB.module.css";
import { type ActionContext, replaceText, settle } from "./editor-actions";
import {
  AI_PREFIX,
  type Draft,
  type Parsed,
  parseValues,
  resolveValue,
  splitRangeText,
  valuesText,
} from "./parser";
import {
  type Anchor,
  type BarOptionGroup,
  BarPopover,
  OptionList,
  searchGroups,
} from "./popover-ui";
import type { SchemaField, SchemaOperator } from "./schema";
import { toBarGroups } from "./suggestions";

export type ValueStageModel = {
  key: string;
  groups: BarOptionGroup[];
  defaultIndex: number;
};

interface ValueStageProps {
  view: EditorView;
  context: ActionContext;
  suggestionKey: string;
  draft: Draft;
  parsed: Parsed;
  field: SchemaField;
  op: SchemaOperator;
  anchor: Anchor;
  highlight: { key: string; index: number };
  /** The widest popover that fits in the window. */
  maxWidth: number;
  onHighlight: (index: number) => void;
  /** Gives the bar the options, so its key handler can pick them. */
  onPublish: (model: ValueStageModel) => void;
}

function lastUnquotedComma(text: string) {
  let isQuoted = false;
  let last = -1;
  [...text].forEach((char, index) => {
    if (char === '"') {
      isQuoted = !isQuoted;
    } else if (char === "," && !isQuoted) {
      last = index;
    }
  });
  return last;
}

/**
 * Prototype: the popover of the value part of a filter, with the widgets of
 * the filter pills: tiles, country flags and continents, the US states map,
 * shares of rows, and the histogram slider for numbers.
 */
export function ValueStage({
  view,
  context,
  suggestionKey,
  draft,
  parsed,
  field,
  op,
  anchor,
  highlight,
  maxWidth,
  onHighlight,
  onPublish,
}: ValueStageProps) {
  const { schema, knownValues } = context;
  const { query, stageIndex } = schema;
  const column = field.column.column;
  const caretPos = view.state.selection.from;

  // For several values, the options complete the last one. For a range, they
  // complete the second value once the first one has its "and".
  const lastComma = op.isMulti ? lastUnquotedComma(parsed.valueText) : -1;
  const range = op.isRange ? splitRangeText(parsed.valueText) : null;
  const headValues = op.isMulti
    ? parseValues(
        parsed.valueText.slice(0, lastComma + 1),
        field,
        op,
        knownValues,
      )
    : range?.second != null
      ? [resolveValue(range.first.trim(), field, op, knownValues)]
      : [];
  const itemText = (
    range != null
      ? (range.second ?? range.first)
      : parsed.valueText.slice(lastComma + 1)
  ).trim();
  const isAiText = itemText.startsWith(AI_PREFIX);
  const searchText = isAiText ? "" : itemText.replace(/^"|"$/g, "");

  const { fieldValues, isListed } = useFieldValues(query, column, searchText);
  // The parser turns typed labels back into values, like "France" into "FR".
  const known = knownValues.get(field.key) ?? [];
  const knownSet = new Set(known.map(([value]) => value));
  const newValues = fieldValues.filter(([value]) => !knownSet.has(value));
  if (newValues.length > 0) {
    knownValues.set(field.key, [...known, ...newValues]);
  }

  const writeValues = (values: string[], keepOpen: boolean) => {
    const unique = op.isRange ? values : [...new Set(values)];
    const trailing =
      keepOpen && op.isMulti && unique.length > 0
        ? ", "
        : keepOpen && op.isRange && unique.length === 1
          ? ` ${t`and`} `
          : "";
    replaceText(
      view,
      draft.from + parsed.opEnd,
      Math.max(draft.to, caretPos),
      ` ${valuesText(unique, field, op, knownValues)}${trailing}`,
    );
    if (!keepOpen) {
      settle(view, context);
    }
  };

  const toggleValue = (value: string) => {
    if (op.isRange) {
      const values = [...headValues, value].slice(0, 2);
      writeValues(values, values.length < 2);
    } else if (!op.isMulti) {
      writeValues([value], false);
    } else if (headValues.includes(value)) {
      writeValues(
        headValues.filter((item) => item !== value),
        true,
      );
    } else {
      writeValues([...headValues, value], true);
    }
  };

  const valueCounts = useValueCounts({
    query,
    stageIndex,
    column,
    filter: undefined,
    isEnabled: hasValueShares(column, op.draft, fieldValues, isListed),
  });
  const widget = useValueWidget({
    column,
    operator: op.draft,
    fieldValues,
    isListed,
    values: parsed.values,
    getShare: valueCounts.type === "counts" ? valueCounts.getShare : undefined,
    isShareEstimate: valueCounts.type === "counts" && valueCounts.isEstimate,
    maxDropdownWidth: maxWidth,
    onValuesChange: (values) => writeValues(values, op.isMulti),
    onToggleValue: toggleValue,
  });

  const aiValues = useAiFilterValues({
    query,
    stageIndex,
    column: field.column,
    operator: op.draft,
    values: headValues,
    onValues: (values) =>
      writeValues(op.isMulti ? [...headValues, ...values] : values, op.isMulti),
  });

  // Recomputed on each render: the actions write to the current draft.
  const getGroups = (): BarOptionGroup[] => {
    const widgetGroups =
      valueCounts.type === "counts"
        ? widget.groups.map((group) => ({
            ...group,
            options: group.options.map((option) => {
              const share = valueCounts.getShare(option.value);
              return {
                ...option,
                share: {
                  value: share,
                  label: formatShare(share, valueCounts.isEstimate),
                },
              };
            }),
          }))
        : widget.groups;
    const allValues = widget.groups.flatMap((group) =>
      group.options
        .map((option) => option.value)
        .filter((value) => value !== SELECT_ALL_VALUE),
    );
    const barGroups = toBarGroups(
      searchGroups(widgetGroups, searchText),
      (value) => {
        if (value !== SELECT_ALL_VALUE) {
          toggleValue(value);
          return;
        }
        const isAllChecked = allValues.every((item) =>
          parsed.values.includes(item),
        );
        writeValues(isAllChecked ? [] : allValues, true);
      },
    );

    const trimmed = searchText.trim();
    const hasExactMatch = barGroups.some((group) =>
      group.options.some(
        (option) =>
          option.label.toLowerCase() === trimmed.toLowerCase() ||
          option.id.toLowerCase() === trimmed.toLowerCase(),
      ),
    );
    const typedValues = parseValues(trimmed, field, op, knownValues);
    if (trimmed && !hasExactMatch && typedValues.length > 0) {
      barGroups.push({
        options: [
          {
            id: "use-typed",
            label: t`Use “${trimmed}”`,
            icon: "enter_or_return",
            run: () => {
              const values =
                op.isMulti || op.isRange
                  ? [...headValues, ...typedValues]
                  : typedValues;
              // A range waits for its second value after the first one.
              writeValues(
                values,
                op.isMulti || (op.isRange && values.length < 2),
              );
            },
          },
        ],
      });
    }

    if (isAiText) {
      const prompt = itemText.slice(AI_PREFIX.length).trim();
      return prompt
        ? [
            {
              options: [
                {
                  id: "ask-ai-values",
                  label:
                    aiValues.state.status === "loading"
                      ? t`Asking AI…`
                      : t`Ask AI for values: “${prompt}”`,
                  icon: "ai" as const,
                  run: () => aiValues.ask(`@${prompt}`),
                },
              ],
            },
          ]
        : [];
    }
    return barGroups;
  };
  const groups = getGroups();

  const defaultIndex =
    op.isMulti && searchText === "" && !isAiText && parsed.values.length > 0
      ? -1
      : 0;
  onPublish({ key: suggestionKey, groups, defaultIndex });
  const highlightIndex =
    highlight.key === suggestionKey ? highlight.index : defaultIndex;

  const numberHeader = op.draft.numberOperator != null && (
    <NumberStats
      query={query}
      stageIndex={stageIndex}
      field={field}
      op={op}
      values={parsed.values}
      onChange={(values) => writeValues(values, true)}
    />
  );
  const footer = getValueCountsFooter(valueCounts, op.draft, parsed.values);
  const aiError =
    aiValues.state.status === "error" ? aiValues.state.message : null;

  return (
    <BarPopover
      anchor={anchor}
      width={Math.min(widget.dropdownWidth ?? 320, maxWidth)}
      aside={isAiText ? undefined : widget.aside}
    >
      {!isAiText && widget.header != null && (
        <div className={BS.popoverHeader}>{widget.header}</div>
      )}
      {!isAiText && numberHeader}
      <OptionList
        groups={groups}
        highlightIndex={highlightIndex}
        isTiles={widget.isTiles && !isAiText}
        columns={widget.columns}
        isMultiSelect={op.isMulti}
        onHighlight={onHighlight}
      />
      {aiValues.state.status === "loading" && <Loader size="xs" m="sm" />}
      {aiError != null && <div className={BS.statusError}>{aiError}</div>}
      {!isAiText && footer != null && (
        <div className={BS.popoverFooter}>{footer}</div>
      )}
    </BarPopover>
  );
}

interface NumberStatsProps {
  query: ValueStageProps["context"]["schema"]["query"];
  stageIndex: number;
  field: SchemaField;
  op: SchemaOperator;
  values: string[];
  onChange: (values: string[]) => void;
}

/** The histogram and the slider of the number filter pills. */
function NumberStats({
  query,
  stageIndex,
  field,
  op,
  values,
  onChange,
}: NumberStatsProps) {
  const valueCount = op.isRange ? 2 : 1;
  const numberValues = Array.from({ length: valueCount }, (_, index) => {
    const number = Number(values[index]);
    return values[index] != null && Number.isFinite(number) ? number : null;
  });
  const { result, isUnavailable, matchCount } = useNumberColumnStats({
    query,
    stageIndex,
    column: field.column.column,
    filter: undefined,
    operator: op.draft.numberOperator,
    values: numberValues,
  });
  if (isUnavailable) {
    return (
      <div className={BS.popoverHeader}>
        <UnavailableNote />
      </div>
    );
  }
  if (result == null || op.draft.numberOperator == null) {
    return null;
  }
  return (
    <div className={BS.popoverHeader}>
      <HistogramSlider
        operator={op.draft.numberOperator}
        histogram={result.histogram}
        min={result.range.min}
        max={result.range.max}
        step={result.step}
        values={numberValues}
        onChange={(newValues) =>
          onChange(
            newValues
              .filter((value) => value != null)
              .map((value) => String(value)),
          )
        }
      />
      {matchCount != null && <MatchCount matchCount={matchCount} />}
      {result.isEstimate && <SampleNote />}
    </div>
  );
}
