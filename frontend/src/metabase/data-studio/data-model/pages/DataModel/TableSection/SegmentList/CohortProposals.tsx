import { t } from "ttag";

import { useCreateSegmentMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  type CohortProposal,
  getMilestoneCohortProposals,
  useSegmentSettings,
  useTableSegments,
} from "metabase/metadata/table-segments";
import { Button, Card, Flex, Group, Icon, Stack, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import { applyConditions, getFilterNames } from "../table-segments";

/**
 * PROTOTYPE: mocked. Cohorts sync would propose from milestones, minus the
 * ones an admin already accepted or dismissed. A status column's buckets are
 * proposed as a segment group instead.
 */
export function useCohortProposals(table: Table): CohortProposal[] {
  const { getTableSegmentsOverrides } = useTableSegments();
  const { getSegmentSettings } = useSegmentSettings();
  const isGenerating = getSegmentSettings(table.db_id, table.schema)
    .generateSegments.value;
  const proposals = isGenerating
    ? getMilestoneCohortProposals(table.fields ?? [])
    : [];
  const { resolvedCohortKeys } = getTableSegmentsOverrides(table);
  return proposals.filter(({ key }) => !resolvedCohortKeys.includes(key));
}

/** Accepting creates a real segment; either choice hides the proposal */
export function useCohortProposalActions(
  table: Table,
  baseQuery: Lib.Query | undefined,
) {
  const { resolveCohort } = useTableSegments();
  const [createSegment] = useCreateSegmentMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const accept = async (proposal: CohortProposal) => {
    if (!baseQuery) {
      return;
    }
    const { error } = await createSegment({
      name: proposal.name,
      definition: Lib.toJsQuery(
        applyConditions(baseQuery, [proposal.condition]),
      ),
      description: proposal.signal,
    });
    if (error) {
      sendErrorToast(t`Failed to create segment`);
    } else {
      resolveCohort(table, proposal.key);
      sendSuccessToast(t`Segment created`);
    }
  };

  const dismiss = (proposal: CohortProposal) =>
    resolveCohort(table, proposal.key);

  return { accept, dismiss };
}

export function CohortProposalItem({
  proposal,
  baseQuery,
  canAccept,
  onAccept,
  onDismiss,
}: {
  proposal: CohortProposal;
  baseQuery: Lib.Query | undefined;
  canAccept: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const filterName = baseQuery
    ? getFilterNames(applyConditions(baseQuery, [proposal.condition]))[0]
    : undefined;

  return (
    <Card
      role="listitem"
      aria-label={proposal.name}
      px="lg"
      py={rem(12)}
      radius="lg"
      shadow="none"
      withBorder
    >
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Stack gap="xxs" miw={0}>
          <Flex align="center" gap="sm">
            <Icon name="segment" c="text-secondary" />
            <Text fw="bold">{proposal.name}</Text>
          </Flex>
          {filterName && <Text lh="lg">{filterName}</Text>}
          <Text size="sm" c="text-secondary">
            {proposal.signal}
          </Text>
        </Stack>
        {canAccept && (
          <Group gap="xs" wrap="nowrap" flex="0 0 auto">
            <Button size="sm" variant="filled" onClick={onAccept}>
              {t`Accept`}
            </Button>
            <Button size="sm" onClick={onDismiss}>
              {t`Dismiss`}
            </Button>
          </Group>
        )}
      </Group>
    </Card>
  );
}
