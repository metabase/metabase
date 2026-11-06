import { t } from "ttag";

import {
  skipToken,
  useCreateSegmentMutation,
  useGetFieldValuesQuery,
} from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  resolveStatusField,
  useLifecycle,
  useValueOrder,
} from "metabase/metadata/lifecycle";
import {
  type SegmentGroup,
  type SegmentGroupMember,
  type SegmentGroupProposal,
  createSegmentGroupId,
  getFlagPartitionProposals,
  getKindPartitionCandidates,
  getKindPartitionProposal,
  getProcessPartitionProposal,
  getSegmentGroupSourceLabel,
  useSegmentGroups,
} from "metabase/metadata/segment-groups";
import { useSegmentSettings } from "metabase/metadata/table-segments";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Button, Card, Flex, Group, Icon, Stack, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field, Segment, Table } from "metabase-types/api";

import { GroupMemberPills } from "../GroupMemberList";
import { matchesListSearch } from "../ListSearchBar";
import { applyConditions } from "../table-segments";

import S from "./SegmentItem/SegmentItem.module.css";

export type SegmentGroupProposals = {
  proposals: SegmentGroupProposal[];
  /** Kind columns whose values decide whether there's a proposal */
  kindCandidates: Field[];
};

/**
 * PROTOTYPE: mocked. Partitions sync would propose: the outcome of the
 * table's process, yes/no flags, and kind columns with few values. Ones an
 * admin handled, or that already have a group, aren't proposed again.
 */
export function useSegmentGroupProposals(table: Table): SegmentGroupProposals {
  const { getSegmentSettings } = useSegmentSettings();
  const { getTableProcess } = useLifecycle();
  const { getSegmentGroups, getResolvedProposalKeys } = useSegmentGroups();
  const isGenerating = getSegmentSettings(table.db_id, table.schema)
    .generateSegments.value;
  const fields = isGenerating ? (table.fields ?? []) : [];
  const statusField = resolveStatusField(
    fields,
    getTableProcess(table).statusFieldId,
  );
  const { values: orderedValues } = useValueOrder(statusField);

  const resolvedKeys = getResolvedProposalKeys(table);
  const groups = getSegmentGroups(table);
  const isOpen = (key: string, sourceFieldId: number) =>
    !resolvedKeys.includes(key) &&
    !groups.some((group) => group.sourceFieldId === sourceFieldId);

  const processProposal = statusField
    ? getProcessPartitionProposal(table, statusField, orderedValues)
    : null;
  const proposals = [
    ...(processProposal ? [processProposal] : []),
    ...getFlagPartitionProposals(fields),
  ].filter(({ key, sourceFieldId }) => isOpen(key, sourceFieldId));

  const kindCandidates = getKindPartitionCandidates(
    fields,
    statusField ? getRawTableFieldId(statusField) : undefined,
  ).filter((field) =>
    isOpen(`kind:${getRawTableFieldId(field)}`, getRawTableFieldId(field)),
  );

  return { proposals, kindCandidates };
}

/** Accepting creates a segment per member, then the group; either hides it */
export function useSegmentGroupProposalActions(
  table: Table,
  baseQuery: Lib.Query | undefined,
) {
  const { saveSegmentGroup, resolveProposal } = useSegmentGroups();
  const [createSegment] = useCreateSegmentMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const accept = async (proposal: SegmentGroupProposal) => {
    if (!baseQuery) {
      return;
    }
    const members: SegmentGroupMember[] = [];
    for (const member of proposal.members) {
      const { data, error } = await createSegment({
        name: member.segmentName,
        definition: Lib.toJsQuery(
          applyConditions(baseQuery, [member.condition]),
        ),
        description: proposal.signal,
      });
      if (error || !data) {
        sendErrorToast(t`Failed to create segment group`);
        return;
      }
      members.push({ segmentId: data.id, label: member.label });
    }
    saveSegmentGroup(table, {
      id: createSegmentGroupId(),
      name: proposal.name,
      kind: "partition",
      members,
      other: proposal.other,
      source: proposal.source,
      sourceFieldId: proposal.sourceFieldId,
    });
    resolveProposal(table, proposal.key);
    sendSuccessToast(t`Segment group created`);
  };

  const dismiss = (proposal: SegmentGroupProposal) =>
    resolveProposal(table, proposal.key);

  return { accept, dismiss };
}

/** A group's members in order, with Other last */
export function getMemberLabels(
  group: Pick<SegmentGroup, "members" | "other">,
  segments: Segment[],
): string[] {
  return [
    ...group.members
      // A deleted segment drops out of its groups
      .filter(({ segmentId }) => segments.some(({ id }) => id === segmentId))
      .map(({ label }) => label),
    ...(group.other ? [t`Other`] : []),
  ];
}

export function SegmentGroupItem({
  group,
  table,
  onOpen,
}: {
  group: SegmentGroup;
  table: Table;
  /** Opens the editor; read-only tables don't get one */
  onOpen?: () => void;
}) {
  const sourceField = table.fields?.find(
    (field) => getRawTableFieldId(field) === group.sourceFieldId,
  );
  const notes = [
    getSegmentGroupSourceLabel(group.source, sourceField),
    group.kind === "overlapping" ? t`Members can overlap` : null,
  ].filter(Boolean);
  const segments = table.segments ?? [];
  // A deleted segment drops out of its groups
  const memberLabels = group.members
    .filter(({ segmentId }) => segments.some(({ id }) => id === segmentId))
    .map(({ label }) => label);

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
      <Stack gap="xs">
        <Flex align="center" gap="sm">
          <Icon name="segment_group" c="core-brand" />
          <Text fw="bold">{group.name}</Text>
        </Flex>
        {memberLabels.length > 0 ? (
          <GroupMemberPills labels={memberLabels} hasOther={group.other} />
        ) : (
          <Text lh="lg" c="text-disabled">{t`No segments yet`}</Text>
        )}
        {notes.length > 0 && (
          <Text size="sm" c="text-secondary">
            {notes.join(" · ")}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export function SegmentGroupProposalItem({
  proposal,
  canAccept,
  onAccept,
  onDismiss,
}: {
  proposal: SegmentGroupProposal;
  canAccept: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const memberLabels = [
    ...proposal.members.map(({ label }) => label),
    ...(proposal.other ? [t`Other`] : []),
  ];
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
            <Icon name="segment_group" c="text-secondary" />
            <Text fw="bold">{proposal.name}</Text>
          </Flex>
          <Text lh="lg">{memberLabels.join(" · ")}</Text>
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

/**
 * A kind column's partition, once its values are in: one member per value.
 * Renders nothing when the column turns out to have too many values.
 */
export function KindPartitionProposalItem({
  field,
  query,
  canAccept,
  onAccept,
  onDismiss,
}: {
  field: Field;
  /** The list's search, which the proposal's name must match */
  query: string;
  canAccept: boolean;
  onAccept: (proposal: SegmentGroupProposal) => void;
  onDismiss: (proposal: SegmentGroupProposal) => void;
}) {
  const { data } = useGetFieldValuesQuery(
    getRawTableFieldId(field) ?? skipToken,
  );
  const values = (data?.values ?? [])
    .map(([value]) => value)
    .filter((value) => value != null && value !== "")
    .map(String);
  const proposal = getKindPartitionProposal(field, values);
  if (!proposal || !matchesListSearch(query, proposal.name)) {
    return null;
  }
  return (
    <SegmentGroupProposalItem
      proposal={proposal}
      canAccept={canAccept}
      onAccept={() => onAccept(proposal)}
      onDismiss={() => onDismiss(proposal)}
    />
  );
}
