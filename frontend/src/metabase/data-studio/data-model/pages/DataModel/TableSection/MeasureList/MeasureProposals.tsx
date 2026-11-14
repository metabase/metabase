import { t } from "ttag";

import { useCreateMeasureMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  type MeasureProposal,
  getMeasureProposals,
  useMeasureGroups,
} from "metabase/metadata/measure-groups";
import { Card, Flex, Group, Icon, Stack, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import { ProposalActions } from "../ListSection";

const STAGE_INDEX = -1;

/** The proposal's aggregation on the table's query, if the table offers it */
export function buildMeasureQuery(
  baseQuery: Lib.Query,
  proposal: MeasureProposal,
): Lib.Query | null {
  const operator = Lib.availableAggregationOperators(
    baseQuery,
    STAGE_INDEX,
  ).find(
    (operator) =>
      Lib.displayInfo(baseQuery, STAGE_INDEX, operator).shortName ===
      proposal.operator,
  );
  if (!operator) {
    return null;
  }
  if (!proposal.field) {
    return Lib.aggregate(
      baseQuery,
      STAGE_INDEX,
      Lib.aggregationClause(operator),
    );
  }
  const fieldName = proposal.field.name;
  const column = Lib.aggregationOperatorColumns(operator).find(
    (column) =>
      Lib.displayInfo(baseQuery, STAGE_INDEX, column).name === fieldName,
  );
  return column
    ? Lib.aggregate(
        baseQuery,
        STAGE_INDEX,
        Lib.aggregationClause(operator, column),
      )
    : null;
}

/**
 * PROTOTYPE: mocked. Sync would propose these; ones an admin already accepted
 * or dismissed stay hidden. Accepting creates a real measure.
 */
export function useMeasureProposals(
  table: Table,
  baseQuery: Lib.Query | undefined,
) {
  const { getResolvedProposalKeys, resolveProposal } = useMeasureGroups();
  const [createMeasure] = useCreateMeasureMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const resolvedKeys = getResolvedProposalKeys(table);
  const proposals = getMeasureProposals(
    table.measures ?? [],
    table.fields ?? [],
  ).filter(({ key }) => !resolvedKeys.includes(key));

  const accept = async (proposal: MeasureProposal) => {
    const query = baseQuery && buildMeasureQuery(baseQuery, proposal);
    if (!query) {
      sendErrorToast(t`Failed to create measure`);
      return;
    }
    const { error } = await createMeasure({
      name: proposal.name,
      definition: Lib.toJsQuery(query),
      description: proposal.signal,
    });
    if (error) {
      sendErrorToast(t`Failed to create measure`);
    } else {
      resolveProposal(table, proposal.key);
      sendSuccessToast(t`Measure created`);
    }
  };

  const dismiss = (proposal: MeasureProposal) =>
    resolveProposal(table, proposal.key);

  return { proposals, accept, dismiss };
}

export function MeasureProposalItem({
  proposal,
  canAccept,
  onAccept,
  onDismiss,
}: {
  proposal: MeasureProposal;
  canAccept: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
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
            <Icon name="ruler" c="text-secondary" />
            <Text fw="bold">{proposal.name}</Text>
          </Flex>
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
