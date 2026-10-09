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

export function isHumanSet(suggestion: MetadataGenerationSuggestion): boolean {
  return suggestion.source === "human";
}

export function canAcceptSuggestion(
  suggestion: MetadataGenerationSuggestion,
): boolean {
  return suggestion.status === "pending" || suggestion.status === "rejected";
}

export function canRejectSuggestion(
  suggestion: MetadataGenerationSuggestion,
): boolean {
  return suggestion.status === "pending" || suggestion.status === "accepted";
}

export function isSuggestionDecidable(
  suggestion: MetadataGenerationSuggestion,
): boolean {
  return canAcceptSuggestion(suggestion) || canRejectSuggestion(suggestion);
}

/** The suggestions that "Accept table" accepts: the backend leaves out human-set ones. */
export function getBulkAcceptable(
  suggestions: MetadataGenerationSuggestion[],
): MetadataGenerationSuggestion[] {
  return suggestions.filter((s) => canAcceptSuggestion(s) && !isHumanSet(s));
}

export function getHumanSetAcceptable(
  suggestions: MetadataGenerationSuggestion[],
): MetadataGenerationSuggestion[] {
  return suggestions.filter((s) => canAcceptSuggestion(s) && isHumanSet(s));
}

export function getRejectable(
  suggestions: MetadataGenerationSuggestion[],
): MetadataGenerationSuggestion[] {
  return suggestions.filter(canRejectSuggestion);
}

export function hasOpenDecisions(table: MetadataGenerationRunTable): boolean {
  return table.counts.pending > 0;
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

function isFieldDataSensitivity(value: string): value is FieldDataSensitivity {
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
