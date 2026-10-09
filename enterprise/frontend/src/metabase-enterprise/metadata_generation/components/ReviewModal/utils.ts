import { msgid, ngettext, t } from "ttag";

import { getSemanticTypeName } from "metabase/common/utils/fields";
import { getDataSensitivityLabel } from "metabase/metadata/components";
import type { BadgeColor } from "metabase/ui";
import {
  FIELD_DATA_SENSITIVITY_TYPES,
  type FieldDataSensitivity,
  type MetadataGenerationApplyFailureReason,
  type MetadataGenerationApplyResult,
  type MetadataGenerationAttribute,
  type MetadataGenerationRunTable,
  type MetadataGenerationStatusCounts,
  type MetadataGenerationSuggestion,
  type MetadataGenerationSuggestionStatus,
} from "metabase-types/api";

const SUGGESTION_STATUSES: MetadataGenerationSuggestionStatus[] = [
  "pending",
  "accepted",
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
    accepted: 0,
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

export function isSuggestionEdited(
  suggestion: MetadataGenerationSuggestion,
): boolean {
  return suggestion.edited_value != null;
}

/** The value apply writes: the edited value when a person edited it, else the proposed value. */
export function getSuggestionValue(
  suggestion: MetadataGenerationSuggestion,
): string {
  return suggestion.edited_value ?? suggestion.proposed_value;
}

export function isHumanSet(suggestion: MetadataGenerationSuggestion): boolean {
  return suggestion.source === "human";
}

/** Pending, accepted and rejected suggestions can change; stale and applied ones cannot. */
export function isSuggestionDecidable(
  suggestion: MetadataGenerationSuggestion,
): boolean {
  return (
    suggestion.status === "pending" ||
    suggestion.status === "accepted" ||
    suggestion.status === "rejected"
  );
}

/** The row checkbox is checked for accepted suggestions and for applied ones, which were accepted. */
export function isSuggestionChecked(
  suggestion: MetadataGenerationSuggestion,
): boolean {
  return suggestion.status === "accepted" || suggestion.status === "applied";
}

/** The suggestions that the table checkbox ticks and unticks: the backend leaves out human-set ones. */
export function getBulkDecidable(
  suggestions: MetadataGenerationSuggestion[],
): MetadataGenerationSuggestion[] {
  return suggestions.filter((s) => isSuggestionDecidable(s) && !isHumanSet(s));
}

export function getHumanSetAcceptable(
  suggestions: MetadataGenerationSuggestion[],
): MetadataGenerationSuggestion[] {
  return suggestions.filter(
    (s) => isSuggestionDecidable(s) && !isSuggestionChecked(s) && isHumanSet(s),
  );
}

export type TableCheckboxState = {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
};

export function getTableCheckboxState(
  suggestions: MetadataGenerationSuggestion[],
): TableCheckboxState {
  const decidable = getBulkDecidable(suggestions);
  const checkedCount = decidable.filter(isSuggestionChecked).length;
  return {
    checked: decidable.length > 0 && checkedCount === decidable.length,
    indeterminate: checkedCount > 0 && checkedCount < decidable.length,
    disabled: decidable.length === 0,
  };
}

/** Pending and rejected suggestions both count as not accepted: apply skips both. */
export function getNotAcceptedCount(
  counts: MetadataGenerationStatusCounts,
): number {
  return counts.pending + counts.rejected;
}

export function hasOpenDecisions(table: MetadataGenerationRunTable): boolean {
  return getNotAcceptedCount(table.counts) > 0;
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
    case "accepted":
      return t`Accepted`;
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
    case "accepted":
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
