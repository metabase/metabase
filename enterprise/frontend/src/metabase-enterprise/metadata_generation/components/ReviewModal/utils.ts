import { msgid, ngettext, t } from "ttag";

import { getSemanticTypeName } from "metabase/common/utils/fields";
import { getDataSensitivityLabel } from "metabase/metadata/components";
import {
  type ApplyMetadataGenerationProposalsRequest,
  FIELD_DATA_SENSITIVITY_TYPES,
  type FieldDataSensitivity,
  type MetadataGenerationApplyFailureReason,
  type MetadataGenerationApplyResult,
  type MetadataGenerationAttribute,
  type MetadataGenerationProposal,
  type MetadataGenerationProposalId,
  type MetadataGenerationProposalTable,
} from "metabase-types/api";

export function getHumanSetPendingCount(
  tables: MetadataGenerationProposalTable[],
): number {
  return tables.reduce((sum, table) => sum + table.human_set_pending, 0);
}

/** Most characters of a description, the same cap the backend applies to generated and edited descriptions. */
export const DESCRIPTION_MAX_LENGTH = 200;

/**
 * The suggestions a person ticked in the review, with the proposed value they saw, which apply sends so that the
 * backend skips a proposal that a run changed since. Nothing is sent until apply.
 */
export type SuggestionSelection = ReadonlyMap<
  MetadataGenerationProposalId,
  string
>;

/** The values a person chose in place of the proposed values, by suggestion. Nothing is sent until apply. */
export type SuggestionEdits = ReadonlyMap<MetadataGenerationProposalId, string>;

export function isSuggestionEdited(
  suggestion: MetadataGenerationProposal,
  edits: SuggestionEdits,
): boolean {
  return edits.has(suggestion.id);
}

/** The value apply writes: the edited value when a person edited it, else the proposed value. */
export function getSuggestionValue(
  suggestion: MetadataGenerationProposal,
  edits: SuggestionEdits,
): string {
  return edits.get(suggestion.id) ?? suggestion.proposed_value;
}

/** `selection` with `suggestions` added when `isSelected`, else removed. */
export function setSelected(
  selection: SuggestionSelection,
  suggestions: MetadataGenerationProposal[],
  isSelected: boolean,
): SuggestionSelection {
  const next = new Map(selection);
  suggestions.forEach(({ id, proposed_value }) =>
    isSelected ? next.set(id, proposed_value) : next.delete(id),
  );
  return next;
}

/** `edits` with the edit of `id` set to `value`, or removed when `value` is `null`. */
export function setEdit(
  edits: SuggestionEdits,
  id: MetadataGenerationProposalId,
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

/**
 * The apply request body for the review: the selected suggestions with the proposed values the person saw, and the
 * edits of selected suggestions only.
 */
export function getApplyRequestBody(
  selection: SuggestionSelection,
  edits: SuggestionEdits,
): Pick<
  ApplyMetadataGenerationProposalsRequest,
  "accept" | "edits" | "proposed_values"
> {
  const accept = [...selection.keys()].sort((a, b) => a - b);
  const proposed_values = Object.fromEntries(selection);
  const selectedEdits = [...edits].filter(([id]) => selection.has(id));
  return selectedEdits.length > 0
    ? { accept, edits: Object.fromEntries(selectedEdits), proposed_values }
    : { accept, proposed_values };
}

export function isHumanSet(suggestion: MetadataGenerationProposal): boolean {
  return suggestion.source === "human";
}

/** The suggestions that the table checkbox ticks and unticks: human-set ones are left out. */
export function getBulkDecidable(
  suggestions: MetadataGenerationProposal[],
): MetadataGenerationProposal[] {
  return suggestions.filter((s) => !isHumanSet(s));
}

export type TableCheckboxState = {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
};

export function getTableCheckboxState(
  suggestions: MetadataGenerationProposal[],
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

export function getTableLabel(table: MetadataGenerationProposalTable): string {
  const name = table.table_name ?? String(table.table_id);
  return table.schema ? `${table.schema}.${name}` : name;
}

export function getFieldLabel(suggestion: MetadataGenerationProposal): string {
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

export function getApplyFailureReasonLabel(
  reason: MetadataGenerationApplyFailureReason,
): string {
  switch (reason) {
    case "changed":
      return t`A newer run changed or removed this suggestion`;
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
