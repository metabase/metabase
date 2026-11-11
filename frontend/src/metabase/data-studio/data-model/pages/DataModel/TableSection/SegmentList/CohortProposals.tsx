import { t } from "ttag";

import { useCreateSegmentMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  resolveStatusField,
  useLifecycle,
  useValueOrder,
} from "metabase/metadata/lifecycle";
import {
  type CohortProposal,
  getMilestoneCohortProposals,
  getStatusCohortProposals,
  useSegmentSettings,
  useTableSegments,
} from "metabase/metadata/table-segments";
import { Card, Flex, Group, Icon, Stack, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import { ClausePills } from "../ClausePills";
import { ProposalActions } from "../ListSection";
import { applyConditions, getFilterNames } from "../table-segments";

/**
 * PROTOTYPE: mocked. Cohorts sync would propose from a status column's
 * buckets and from milestone dates, minus the ones an admin already accepted
 * or dismissed. Proposals are never default segments; accepting one makes a
 * custom segment.
 */
export function useCohortProposals(table: Table): CohortProposal[] {
  const { getTableSegmentsOverrides } = useTableSegments();
  const { getSegmentSettings } = useSegmentSettings();
  const { getTableProcess } = useLifecycle();
  const isGenerating = getSegmentSettings(table.db_id, table.schema)
    .generateSegments.value;
  const fields = isGenerating ? (table.fields ?? []) : [];
  const statusField = resolveStatusField(
    fields,
    getTableProcess(table).statusFieldId,
  );
  const { values: orderedValues } = useValueOrder(statusField);
  const proposals = [
    ...(statusField
      ? getStatusCohortProposals(table, statusField, orderedValues)
      : []),
    ...getMilestoneCohortProposals(fields),
  ];
  const { resolvedCohortKeys } = getTableSegmentsOverrides(table);
  // A status group accepted on the Groups tab already made these segments
  const segmentNames = (table.segments ?? []).map(({ name }) => name);
  return proposals.filter(
    ({ key, name }) =>
      !resolvedCohortKeys.includes(key) && !segmentNames.includes(name),
  );
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
  isMuted = false,
  onAccept,
  onDismiss,
}: {
  proposal: CohortProposal;
  baseQuery: Lib.Query | undefined;
  canAccept: boolean;
  /** Secondary colors, to tell a proposal apart in a list of real segments */
  isMuted?: boolean;
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
        <Stack gap="xs" miw={0}>
          <Flex align="center" gap="sm">
            <Icon
              name="segment"
              c={isMuted ? "icon-secondary" : "text-secondary"}
            />
            <Text fw="bold" c={isMuted ? "text-secondary" : undefined}>
              {proposal.name}
            </Text>
          </Flex>
          {filterName && (
            <ClausePills clauses={[{ kind: "filter", name: filterName }]} />
          )}
        </Stack>
        <ProposalActions
          canAccept={canAccept}
          onAccept={onAccept}
          onDismiss={onDismiss}
        />
      </Group>
    </Card>
  );
}
