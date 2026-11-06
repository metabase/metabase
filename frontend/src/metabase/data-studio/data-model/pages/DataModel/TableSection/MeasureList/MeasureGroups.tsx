import { t } from "ttag";

import {
  type MeasureGroup,
  type MeasureGroupProposal,
  createMeasureGroupId,
  getMeasureGroupProposals,
  getMeasureGroupSourceLabel,
  useMeasureGroups,
} from "metabase/metadata/measure-groups";
import { Button, Card, Flex, Group, Icon, Stack, Text, rem } from "metabase/ui";
import type { Measure, Table } from "metabase-types/api";

import S from "./MeasureItem/MeasureItem.module.css";

/**
 * PROTOTYPE: mocked. Groups sync would suggest, one per measure kind, minus
 * the ones an admin already accepted or dismissed.
 */
export function useMeasureGroupProposals(table: Table) {
  const {
    getMeasureGroups,
    getResolvedProposalKeys,
    saveMeasureGroup,
    resolveProposal,
  } = useMeasureGroups();
  const resolvedKeys = getResolvedProposalKeys(table);
  const proposals = getMeasureGroupProposals(
    table.measures ?? [],
    table.fields ?? [],
    getMeasureGroups(table),
  ).filter(({ key }) => !resolvedKeys.includes(key));

  const accept = (proposal: MeasureGroupProposal) => {
    saveMeasureGroup(table, {
      id: createMeasureGroupId(),
      name: proposal.name,
      measureIds: proposal.measureIds,
      source: "suggestion",
    });
    resolveProposal(table, proposal.key);
  };

  const dismiss = (proposal: MeasureGroupProposal) =>
    resolveProposal(table, proposal.key);

  return { proposals, accept, dismiss };
}

/** A group's measures in order; deleted ones drop out */
export function getMemberNames(
  measureIds: MeasureGroup["measureIds"],
  measures: Measure[],
): string[] {
  return measureIds.flatMap((measureId) => {
    const measure = measures.find(({ id }) => id === measureId);
    return measure ? [measure.name] : [];
  });
}

export function MeasureGroupItem({
  group,
  measures,
  onOpen,
}: {
  group: MeasureGroup;
  measures: Measure[];
  /** Opens the editor; people who can't edit measures don't get one */
  onOpen?: () => void;
}) {
  const memberNames = getMemberNames(group.measureIds, measures);
  const sourceLabel = getMeasureGroupSourceLabel(group.source);
  return (
    <Card
      className={onOpen ? S.card : undefined}
      component={onOpen ? "button" : "div"}
      onClick={onOpen}
      aria-label={group.name}
      role="listitem"
      ta="left"
      px="lg"
      py={rem(12)}
      radius="lg"
      shadow="none"
      withBorder
    >
      <Stack gap="xxs">
        <Flex align="center" gap="sm">
          <Icon name="folder" c="core-brand" />
          <Text fw="bold">{group.name}</Text>
        </Flex>
        {memberNames.length > 0 ? (
          <Text lh="lg">{memberNames.join(" · ")}</Text>
        ) : (
          <Text lh="lg" c="text-disabled">{t`No measures`}</Text>
        )}
        {sourceLabel && (
          <Text size="sm" c="text-secondary">
            {sourceLabel}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export function MeasureGroupProposalItem({
  proposal,
  measures,
  canAccept,
  onAccept,
  onDismiss,
}: {
  proposal: MeasureGroupProposal;
  measures: Measure[];
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
            <Icon name="folder" c="text-secondary" />
            <Text fw="bold">{proposal.name}</Text>
          </Flex>
          <Text lh="lg">
            {getMemberNames(proposal.measureIds, measures).join(" · ")}
          </Text>
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
