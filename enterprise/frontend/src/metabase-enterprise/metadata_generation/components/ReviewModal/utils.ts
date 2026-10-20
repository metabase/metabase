import { msgid, ngettext, t } from "ttag";

import { getSemanticTypeName } from "metabase/common/utils/fields";
import { getDataSensitivityLabel } from "metabase/metadata/components";
import type { BadgeColor } from "metabase/ui";
import {
  type ApplyMetadataGenerationRunRequest,
  FIELD_DATA_SENSITIVITY_TYPES,
  type FieldDataSensitivity,
  type MetadataGenerationApplyFailureReason,
  type MetadataGenerationApplyResult,
  type MetadataGenerationAttribute,
  type MetadataGenerationRunTable,
  type MetadataGenerationStatusCounts,
  type MetadataGenerationSuggestion,
  type MetadataGenerationSuggestionId,
  type MetadataGenerationSuggestionStatus,
} from "metabase-types/api";

const SUGGESTION_STATUSES: MetadataGenerationSuggestionStatus[] = [
  "pending",
  "rejected",
  "stale",
  "applied",
];

export type RunTotals = {
  total: number;
  counts: MetadataGenerationStatusCounts;
  humanSetPending: number;
};

export function getRunTotals(tables: MetadataGenerationRunTable[]): RunTotals {
  const counts: MetadataGenerationStatusCounts = {
    pending: 0,
    rejected: 0,
    stale: 0,
    applied: 0,
  };
  let total = 0;
  let humanSetPending = 0;
  for (const table of tables) {
    total += table.total;
    humanSetPending += table.human_set_pending;
    for (const status of SUGGESTION_STATUSES) {
      counts[status] += table.counts[status];
    }
  }
  return { total, counts, humanSetPending };
}

/** Most characters of a description, the same cap the backend applies to generated and edited descriptions. */
export const DESCRIPTION_MAX_LENGTH = 200;

/** The suggestions a person ticked in the review. Nothing is sent until apply. */
export type SuggestionSelection = ReadonlySet<MetadataGenerationSuggestionId>;

/** The values a person chose in place of the proposed values, by suggestion. Nothing is sent until apply. */
export type SuggestionEdits = ReadonlyMap<
  MetadataGenerationSuggestionId,
  string
>;

export function isSuggestionEdited(
  suggestion: MetadataGenerationSuggestion,
  edits: SuggestionEdits,
): boolean {
  return edits.has(suggestion.id);
}

/** The value apply writes: the edited value when a person edited it, else the proposed value. */
export function getSuggestionValue(
  suggestion: MetadataGenerationSuggestion,
  edits: SuggestionEdits,
): string {
  return edits.get(suggestion.id) ?? suggestion.proposed_value;
}

/** `selection` with `ids` added when `isSelected`, else removed. */
export function setSelected(
  selection: SuggestionSelection,
  ids: MetadataGenerationSuggestionId[],
  isSelected: boolean,
): SuggestionSelection {
  const next = new Set(selection);
  ids.forEach((id) => (isSelected ? next.add(id) : next.delete(id)));
  return next;
}

/** `edits` with the edit of `id` set to `value`, or removed when `value` is `null`. */
export function setEdit(
  edits: SuggestionEdits,
  id: MetadataGenerationSuggestionId,
  value: string | null,
): SuggestionEdits {
  const next = new Map(edits);
  if (value == null) {
    next.delete(id);
  } else {
    next.set(id, value);
  }
  return next;
}

/** The apply request body for the review: the selected suggestions, with the edits of selected suggestions only. */
export function getApplyRequestBody(
  selection: SuggestionSelection,
  edits: SuggestionEdits,
): Pick<ApplyMetadataGenerationRunRequest, "accept" | "edits"> {
  const accept = [...selection].sort((a, b) => a - b);
  const selectedEdits = [...edits].filter(([id]) => selection.has(id));
  return selectedEdits.length > 0
    ? { accept, edits: Object.fromEntries(selectedEdits) }
    : { accept };
}

export function isHumanSet(suggestion: MetadataGenerationSuggestion): boolean {
  return suggestion.source === "human";
}

/** Pending and rejected suggestions can be applied; stale and applied ones cannot. */
export function isSuggestionDecidable(
  suggestion: MetadataGenerationSuggestion,
): boolean {
  return suggestion.status === "pending" || suggestion.status === "rejected";
}

/** The suggestions that the table checkbox ticks and unticks: human-set ones are left out. */
export function getBulkDecidable(
  suggestions: MetadataGenerationSuggestion[],
): MetadataGenerationSuggestion[] {
  return suggestions.filter((s) => isSuggestionDecidable(s) && !isHumanSet(s));
}

export type TableCheckboxState = {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
};

export function getTableCheckboxState(
  suggestions: MetadataGenerationSuggestion[],
  selection: SuggestionSelection,
): TableCheckboxState {
  const decidable = getBulkDecidable(suggestions);
  const checkedCount = decidable.filter(({ id }) => selection.has(id)).length;
  return {
    checked: decidable.length > 0 && checkedCount === decidable.length,
    indeterminate: checkedCount > 0 && checkedCount < decidable.length,
    disabled: decidable.length === 0,
  };
}

/** Pending and rejected suggestions are still open: a later apply can accept them. */
export function getOpenCount(counts: MetadataGenerationStatusCounts): number {
  return counts.pending + counts.rejected;
}

export function hasOpenDecisions(table: MetadataGenerationRunTable): boolean {
  return getOpenCount(table.counts) > 0;
}

export function getTableLabel(table: MetadataGenerationRunTable): string {
  const name = table.table_name ?? String(table.table_id);
  return table.schema ? `${table.schema}.${name}` : name;
}

export function getFieldLabel(
  suggestion: MetadataGenerationSuggestion,
): string {
  return suggestion.field_display_name || suggestion.field_name;
}

export function isFieldDataSensitivity(
  value: string,
): value is FieldDataSensitivity {
  return FIELD_DATA_SENSITIVITY_TYPES.some((type) => type === value);
}

export function formatSuggestionValue(
  attribute: MetadataGenerationAttribute,
  value: string | null,
): string | null {
  if (value == null || value === "") {
    return null;
  }
  switch (attribute) {
    case "data_sensitivity":
      return isFieldDataSensitivity(value)
        ? getDataSensitivityLabel(value)
        : value;
    case "semantic_type":
      return getSemanticTypeName(value) ?? value;
    case "description":
      return value;
  }
}

export function getSuggestionStatusLabel(
  status: MetadataGenerationSuggestionStatus,
): string {
  switch (status) {
    case "pending":
      return t`Pending`;
    case "rejected":
      return t`Rejected`;
    case "stale":
      return t`Stale`;
    case "applied":
      return t`Applied`;
  }
}

export function getSuggestionStatusColor(
  status: MetadataGenerationSuggestionStatus,
): BadgeColor {
  switch (status) {
    case "pending":
      return "brand";
    case "applied":
      return "positive";
    case "rejected":
      return "neutral";
    case "stale":
      return "warning";
  }
}

export function getApplyFailureReasonLabel(
  reason: MetadataGenerationApplyFailureReason,
): string {
  switch (reason) {
    case "field_not_found":
      return t`The field no longer exists`;
    case "not_writable":
      return t`The field cannot be edited`;
    case "key_field":
      return t`The field is a primary or foreign key`;
    case "type_mismatch":
      return t`The semantic type does not fit the field type`;
    case "error":
      return t`An error occurred while writing the table`;
  }
}

export function getApplySummary(result: MetadataGenerationApplyResult): string {
  const parts = [
    ngettext(
      msgid`${result.written} value written`,
      `${result.written} values written`,
      result.written,
    ),
  ];
  if (result.rejected > 0) {
    parts.push(
      ngettext(
        msgid`${result.rejected} rejected`,
        `${result.rejected} rejected`,
        result.rejected,
      ),
    );
  }
  if (result.stale > 0) {
    parts.push(
      ngettext(
        msgid`${result.stale} skipped because the field changed`,
        `${result.stale} skipped because the fields changed`,
        result.stale,
      ),
    );
  }
  if (result.failed > 0) {
    parts.push(
      ngettext(
        msgid`${result.failed} failed`,
        `${result.failed} failed`,
        result.failed,
      ),
    );
  }
  return parts.join(", ");
}
