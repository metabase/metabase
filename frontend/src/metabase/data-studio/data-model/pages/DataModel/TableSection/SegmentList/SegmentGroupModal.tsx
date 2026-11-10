import { useState } from "react";
import { t } from "ttag";

import {
  type SegmentGroup,
  type SegmentGroupKind,
  type SegmentGroupMember,
  createSegmentGroupId,
  getSegmentGroupKindLabel,
  getSegmentGroupMemberKey,
  isSegmentGroupMemberPresent,
} from "metabase/metadata/segment-groups";
import {
  Button,
  Group,
  Icon,
  Modal,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "metabase/ui";
import type { Segment } from "metabase-types/api";

import { GroupMemberList } from "../GroupMemberList";
import {
  type ResolvedSystemSegment,
  isUsableSystemSegment,
} from "../table-segments";

type SegmentGroupModalProps = {
  /** The group to edit; none makes a new one */
  group: SegmentGroup | undefined;
  segments: Segment[];
  systemSegments: ResolvedSystemSegment[];
  onSave: (group: SegmentGroup) => void;
  onDelete: (groupId: string) => void;
  onClose: () => void;
};

/**
 * Names a group, picks its segments in order, and says whether they split
 * the rows (a partition) or can overlap. Mount it fresh per group.
 */
export function SegmentGroupModal({
  group,
  segments,
  systemSegments,
  onSave,
  onDelete,
  onClose,
}: SegmentGroupModalProps) {
  const [name, setName] = useState(group?.name ?? "");
  // Required: an empty name turns red only after someone typed one and cleared it
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [hasTypedName, setHasTypedName] = useState(false);
  const isNameMissing = hasTypedName && !isNameFocused && name.trim() === "";
  const [kind, setKind] = useState<SegmentGroupKind>(
    group?.kind ?? "partition",
  );
  const [members, setMembers] = useState<SegmentGroupMember[]>(
    // Members whose segment was deleted drop out on the next save
    (group?.members ?? []).filter((member) =>
      isSegmentGroupMemberPresent(member, segments),
    ),
  );
  const [other, setOther] = useState(group?.other ?? false);

  const memberKeys = new Set(members.map(getSegmentGroupMemberKey));
  const memberOptions: { member: SegmentGroupMember; label: string }[] = [
    ...segments.map((segment) => ({
      member: { segmentId: segment.id, label: segment.name },
      label: segment.name,
    })),
    // A system segment that filters nothing can't split rows
    ...systemSegments.filter(isUsableSystemSegment).map((segment) => ({
      member: { systemRole: segment.role, label: segment.label },
      label: segment.label,
    })),
  ];
  const availableOptions = memberOptions.filter(
    ({ member }) => !memberKeys.has(getSegmentGroupMemberKey(member)),
  );
  const getMemberName = (member: SegmentGroupMember) =>
    getSegmentGroupMemberName(member, segments, systemSegments);
  // A group can start empty and gain segments as they're made
  const canSave = name.trim() !== "";

  const handleSave = () =>
    onSave({
      id: group?.id ?? createSegmentGroupId(),
      name: name.trim(),
      kind,
      members: members.map((member) => ({
        ...member,
        label: member.label.trim() || getMemberName(member),
      })),
      other: kind === "partition" && other,
      source: group?.source ?? "admin",
      sourceFieldId: group?.sourceFieldId,
      // Sync updates its own groups, but never one an admin changed
      isAdminEdited: group != null && group.source !== "admin",
    });

  return (
    <Modal
      opened
      title={group ? t`Edit segment group` : t`New segment group`}
      size="lg"
      onClose={onClose}
    >
      <Stack gap="lg">
        <TextInput
          label={t`Name`}
          placeholder={t`Deal outcome`}
          value={name}
          required
          error={isNameMissing && t`Give the group a name`}
          onChange={(event) => {
            setName(event.target.value);
            setHasTypedName(true);
          }}
          onFocus={() => setIsNameFocused(true)}
          onBlur={() => setIsNameFocused(false)}
          data-autofocus
        />

        <Radio.Group
          label={t`Kind`}
          value={kind}
          onChange={(value) =>
            setKind(value === "overlapping" ? value : "partition")
          }
        >
          <Stack gap="sm" mt="sm">
            <Radio
              value="partition"
              label={getSegmentGroupKindLabel("partition")}
              description={t`Each row belongs to only one segment so they can be compared side by side.`}
            />
            <Radio
              value="overlapping"
              label={getSegmentGroupKindLabel("overlapping")}
              description={t`A row can be in several segments. These are offered only as filters, not as group bys.`}
            />
          </Stack>
        </Radio.Group>

        {kind === "partition" && (
          <Switch
            label={t`Group the rest as Other`}
            description={t`Rows that don't belong to any segment show up last, within "Other".`}
            checked={other}
            onChange={(event) => setOther(event.currentTarget.checked)}
          />
        )}

        <Stack gap="sm">
          <Text fw="bold">{t`Member segments`}</Text>
          <Select
            aria-label={t`Add a segment`}
            placeholder={
              availableOptions.length > 0
                ? t`Add a segment`
                : t`No more segments on this table`
            }
            data={[
              {
                group: t`Custom segments`,
                items: getOptionItems(
                  availableOptions.filter(
                    ({ member }) => "segmentId" in member,
                  ),
                ),
              },
              {
                group: t`System segments`,
                items: getOptionItems(
                  availableOptions.filter(
                    ({ member }) => "systemRole" in member,
                  ),
                ),
              },
            ].filter(({ items }) => items.length > 0)}
            value={null}
            disabled={availableOptions.length === 0}
            searchable
            onChange={(value) => {
              const option = availableOptions.find(
                ({ member }) => getSegmentGroupMemberKey(member) === value,
              );
              if (option) {
                setMembers([...members, option.member]);
              }
            }}
          />
          {members.length > 0 && (
            <GroupMemberList<SegmentGroupMember>
              items={members}
              getId={getSegmentGroupMemberKey}
              getName={getMemberName}
              header={
                <Group gap="sm" wrap="nowrap">
                  <Text size="sm" fw="bold" c="text-secondary" flex={1}>
                    {t`Segment`}
                  </Text>
                  <Text size="sm" fw="bold" c="text-secondary" flex={1}>
                    {t`Label`}
                  </Text>
                </Group>
              }
              renderContent={(member) => (
                // The segment as it's named everywhere, and what this group
                // calls it in Group by, filters, and comparisons
                <Group gap="sm" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap" flex={1} miw={0}>
                    <Icon name="segment" c="core-filter" flex="0 0 auto" />
                    <Text truncate title={getMemberName(member)}>
                      {getMemberName(member)}
                    </Text>
                  </Group>
                  <TextInput
                    flex={1}
                    miw={0}
                    aria-label={t`Label for ${getMemberName(member)}`}
                    value={member.label}
                    placeholder={getMemberName(member)}
                    onChange={(event) =>
                      setMembers(
                        members.map((known) =>
                          getSegmentGroupMemberKey(known) ===
                          getSegmentGroupMemberKey(member)
                            ? { ...known, label: event.target.value }
                            : known,
                        ),
                      )
                    }
                  />
                </Group>
              )}
              onReorder={setMembers}
              onRemove={(member) =>
                setMembers(
                  members.filter(
                    (known) =>
                      getSegmentGroupMemberKey(known) !==
                      getSegmentGroupMemberKey(member),
                  ),
                )
              }
            />
          )}
        </Stack>

        <Group justify="space-between">
          {group ? (
            <Button
              variant="subtle"
              color="negative"
              onClick={() => onDelete(group.id)}
            >
              {t`Delete`}
            </Button>
          ) : (
            <span />
          )}
          <Group gap="sm">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <Button variant="filled" disabled={!canSave} onClick={handleSave}>
              {t`Save`}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

function getSegmentGroupMemberName(
  member: SegmentGroupMember,
  segments: Segment[],
  systemSegments: ResolvedSystemSegment[],
): string {
  return "segmentId" in member
    ? (segments.find(({ id }) => id === member.segmentId)?.name ?? member.label)
    : (systemSegments.find(({ role }) => role === member.systemRole)?.label ??
        member.label);
}

function getOptionItems(
  options: { member: SegmentGroupMember; label: string }[],
) {
  return options.map(({ member, label }) => ({
    value: getSegmentGroupMemberKey(member),
    label,
  }));
}
