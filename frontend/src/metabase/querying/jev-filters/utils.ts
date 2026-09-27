import _ from "underscore";

import type {
  JevFilterAlternative,
  JevFilterSuggestion,
} from "metabase/api/jev-filters";

import type {
  JevAppliedFilter,
  JevPaletteRow,
  JevPaletteRowSpec,
  JevPaletteSelections,
} from "./types";

/** At or above this, Jev's pick starts selected; below it the row starts on "No change". */
export const CONFIDENT_PICK = 0.7;

export function getSuggestionOptions(
  suggestion: JevFilterSuggestion,
): JevFilterAlternative[] {
  const [pickAlternatives, alternatives] = _.partition(
    suggestion.alternatives ?? [],
    (alternative) => _.isEqual(alternative.value, suggestion.value),
  );
  const pick: JevFilterAlternative = {
    value: suggestion.value,
    label: suggestion.label,
    probability: suggestion.confidence,
    parameter_type:
      pickAlternatives[0]?.parameter_type ?? suggestion.parameter_type,
  };
  return [pick, ...alternatives];
}

function toRow(
  spec: JevPaletteRowSpec,
  suggestion: JevFilterSuggestion | null,
): JevPaletteRow {
  return {
    ...spec,
    suggestion,
    options: suggestion ? getSuggestionOptions(suggestion) : [],
  };
}

/** Base rows keep their order; suggestions for filters not listed are appended. */
export function mergeRows(
  specs: readonly JevPaletteRowSpec[],
  suggestions: readonly JevFilterSuggestion[],
  describeExtraRow?: (suggestion: JevFilterSuggestion) => JevPaletteRowSpec,
): JevPaletteRow[] {
  const suggestionsById = new Map(
    suggestions.map((suggestion) => [suggestion.parameter_id, suggestion]),
  );
  const specIds = new Set(specs.map((spec) => spec.id));
  const extraRows = suggestions
    .filter((suggestion) => !specIds.has(suggestion.parameter_id))
    .map((suggestion) =>
      toRow(
        describeExtraRow?.(suggestion) ?? {
          id: suggestion.parameter_id,
          name: suggestion.parameter_name,
        },
        suggestion,
      ),
    );
  return [
    ...specs.map((spec) => toRow(spec, suggestionsById.get(spec.id) ?? null)),
    ...extraRows,
  ];
}

export function getNoChangeIndex(row: JevPaletteRow): number {
  return row.options.length;
}

export function getDefaultSelection(row: JevPaletteRow): number {
  return row.suggestion && row.suggestion.confidence >= CONFIDENT_PICK
    ? 0
    : getNoChangeIndex(row);
}

export function getSelection(
  row: JevPaletteRow,
  selections: JevPaletteSelections,
): number {
  return selections[row.id] ?? getDefaultSelection(row);
}

export function cycleSelection(
  row: JevPaletteRow,
  current: number,
  delta: 1 | -1,
): number {
  const count = row.options.length + 1;
  return (current + delta + count) % count;
}

export function getAppliedFilters(
  rows: readonly JevPaletteRow[],
  selections: JevPaletteSelections,
): JevAppliedFilter[] {
  return rows.flatMap((row) => {
    const option = row.options[getSelection(row, selections)];
    if (!row.suggestion || !option) {
      return [];
    }
    return [
      {
        suggestion: row.suggestion,
        value: option.value,
        label: option.label,
        parameterType: option.parameter_type ?? row.suggestion.parameter_type,
      },
    ];
  });
}

export function formatProbability(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}
