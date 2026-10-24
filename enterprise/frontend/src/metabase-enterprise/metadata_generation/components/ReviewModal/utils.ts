import { msgid, ngettext, t } from "ttag";

import { getSemanticTypeName } from "metabase/common/utils/fields";
import { getDataSensitivityLabel } from "metabase/metadata/components";
import type {
  ApplyMetadataGenerationProposalsRequest,
  MetadataGenerationApplyFailureReason,
  MetadataGenerationApplyResult,
  MetadataGenerationAttribute,
  MetadataGenerationProposal,
  MetadataGenerationProposalId,
  MetadataGenerationProposalTable,
} from "metabase-types/api";
import { isFieldDataSensitivity } from "metabase-types/guards";

export function getHumanSetPendingCount(
  tables: MetadataGenerationProposalTable[],
): number {
  return tables.reduce((sum, table) => sum + table.human_set_pending, 0);
}

/** Most characters of a description, the same cap the backend applies to generated and edited descriptions. */
export const DESCRIPTION_MAX_LENGTH = 200;

/**
 * The proposals a person ticked in the review, with the proposed value they saw, which apply sends so that the
 * backend skips a proposal that a run changed since. Nothing is sent until apply.
 */
export type ProposalSelection = ReadonlyMap<
  MetadataGenerationProposalId,
  string
>;

/** The values a person chose in place of the proposed values, by proposal. Nothing is sent until apply. */
export type ProposalEdits = ReadonlyMap<MetadataGenerationProposalId, string>;

export function isProposalEdited(
  proposal: MetadataGenerationProposal,
  edits: ProposalEdits,
): boolean {
  return edits.has(proposal.id);
}

/** The value apply writes: the edited value when a person edited it, else the proposed value. */
export function getProposalValue(
  proposal: MetadataGenerationProposal,
  edits: ProposalEdits,
): string {
  return edits.get(proposal.id) ?? proposal.proposed_value;
}

/** `selection` with `suggestions` added when `isSelected`, else removed. */
export function setSelected(
  selection: ProposalSelection,
  proposals: MetadataGenerationProposal[],
  isSelected: boolean,
): ProposalSelection {
  const next = new Map(selection);
  proposals.forEach(({ id, proposed_value }) =>
    isSelected ? next.set(id, proposed_value) : next.delete(id),
  );
  return next;
}

/** `edits` with the edit of `id` set to `value`, or removed when `value` is `null`. */
export function setEdit(
  edits: ProposalEdits,
  id: MetadataGenerationProposalId,
  value: string | null,
): ProposalEdits {
  const next = new Map(edits);
  if (value == null) {
    next.delete(id);
  } else {
    next.set(id, value);
  }
  return next;
}

/**
 * The apply request body for the review: the selected proposals with the proposed values the person saw, and the
 * edits of selected proposals only.
 */
export function getApplyRequestBody(
  selection: ProposalSelection,
  edits: ProposalEdits,
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

export function isHumanSet(proposal: MetadataGenerationProposal): boolean {
  return proposal.source === "human";
}

/** The proposals that the table checkbox ticks and unticks: human-set ones are left out. */
export function getBulkDecidable(
  proposals: MetadataGenerationProposal[],
): MetadataGenerationProposal[] {
  return proposals.filter((s) => !isHumanSet(s));
}

export type TableCheckboxState = {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
};

export function getTableCheckboxState(
  proposals: MetadataGenerationProposal[],
  selection: ProposalSelection,
): TableCheckboxState {
  const decidable = getBulkDecidable(proposals);
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

export function getFieldLabel(proposal: MetadataGenerationProposal): string {
  return proposal.field_display_name || proposal.field_name;
}

export function formatProposalValue(
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
      return t`This suggestion changed or was handled since you opened the review`;
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
  const sentences = [
    ngettext(
      msgid`${result.written} value written.`,
      `${result.written} values written.`,
      result.written,
    ),
  ];
  if (result.rejected > 0) {
    sentences.push(
      ngettext(
        msgid`${result.rejected} suggestion rejected.`,
        `${result.rejected} suggestions rejected.`,
        result.rejected,
      ),
    );
  }
  if (result.failed > 0) {
    sentences.push(
      ngettext(
        msgid`${result.failed} suggestion failed.`,
        `${result.failed} suggestions failed.`,
        result.failed,
      ),
    );
  }
  return sentences.join(" ");
}
