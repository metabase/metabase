import { msgid, ngettext, t } from "ttag";

import { skipToken } from "metabase/api";
import { getUserIsAdmin } from "metabase/current-user";
import type { MetadataGenerationPendingBadgeProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Badge, Group, Icon, Stack, Switch, Text, Tooltip } from "metabase/ui";
import { useListMetadataGenerationProposalsQuery } from "metabase-enterprise/api";
import {
  type MetadataGenerationProposal,
  isConcreteTableId,
} from "metabase-types/api";

import { getAttributeLabel } from "../../utils";
import { formatSuggestionValue, isHumanSet } from "../ReviewModal/utils";

export function PendingBadge({
  tableId,
  fieldId,
  isPreview,
  onPreviewChange,
}: MetadataGenerationPendingBadgeProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const { data: proposals = [] } = useListMetadataGenerationProposalsQuery(
    isAdmin && isConcreteTableId(tableId) ? { table_id: tableId } : skipToken,
  );
  const pending =
    fieldId != null
      ? proposals.filter((proposal) => proposal.field_id === fieldId)
      : proposals;

  if (!isAdmin || pending.length === 0) {
    return null;
  }

  return (
    <Group gap="sm" wrap="nowrap" data-testid="metadata-generation-pending">
      <Tooltip
        label={
          fieldId != null ? (
            <FieldProposals proposals={pending} />
          ) : (
            getTableTooltip(pending)
          )
        }
        maw="25rem"
        multiline
      >
        <Badge
          variant="light"
          color="brand"
          leftSection={<Icon name="sparkles" size={12} />}
        >
          {ngettext(
            msgid`${pending.length} AI suggestion`,
            `${pending.length} AI suggestions`,
            pending.length,
          )}
        </Badge>
      </Tooltip>
      <Switch
        label={t`Preview`}
        aria-label={t`Preview the AI suggestions`}
        checked={isPreview}
        onChange={(event) => onPreviewChange(event.currentTarget.checked)}
      />
    </Group>
  );
}

function FieldProposals({
  proposals,
}: {
  proposals: MetadataGenerationProposal[];
}) {
  return (
    <Stack gap={4}>
      {proposals.map((proposal) => (
        <Text key={proposal.id} c="inherit" size="sm">
          {isHumanSet(proposal)
            ? t`${getAttributeLabel(proposal.attribute)}: ${formatSuggestionValue(proposal.attribute, proposal.proposed_value)} (replaces a value a person set)`
            : t`${getAttributeLabel(proposal.attribute)}: ${formatSuggestionValue(proposal.attribute, proposal.proposed_value)}`}
        </Text>
      ))}
    </Stack>
  );
}

function getTableTooltip(proposals: MetadataGenerationProposal[]): string {
  const fieldCount = new Set(proposals.map(({ field_id }) => field_id)).size;
  return ngettext(
    msgid`Suggestions for ${fieldCount} field are waiting for review.`,
    `Suggestions for ${fieldCount} fields are waiting for review.`,
    fieldCount,
  );
}
