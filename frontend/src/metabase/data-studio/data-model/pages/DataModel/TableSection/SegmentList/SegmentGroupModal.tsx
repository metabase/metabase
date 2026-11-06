import { useState } from "react";
import { t } from "ttag";

import {
  type SegmentGroup,
  type SegmentGroupKind,
  type SegmentGroupMember,
  createSegmentGroupId,
  getSegmentGroupKindLabel,
} from "metabase/metadata/segment-groups";
import {
  ActionIcon,
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

type SegmentGroupModalProps = {
  /** The group to edit; none makes a new one */
  group: SegmentGroup | undefined;
  segments: Segment[];
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
  onSave,
  onDelete,
  onClose,
}: SegmentGroupModalProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [kind, setKind] = useState<SegmentGroupKind>(
    group?.kind ?? "partition",
  );
  const [members, setMembers] = useState<SegmentGroupMember[]>(
    // Members whose segment was deleted drop out on the next save
    (group?.members ?? []).filter(({ segmentId }) =>
      segments.some(({ id }) => id === segmentId),
    ),
  );
  const [other, setOther] = useState(group?.other ?? false);

  const availableSegments = segments.filter(
    ({ id }) => !members.some(({ segmentId }) => segmentId === id),
  );
  const canSave = name.trim() !== "" && members.length >= 2;

  const moveMember = (index: number, offset: number) => {
    const next = [...members];
    const [member] = next.splice(index, 1);
    next.splice(index + offset, 0, member);
    setMembers(next);
  };

  const handleSave = () =>
    onSave({
      id: group?.id ?? createSegmentGroupId(),
      name: name.trim(),
      kind,
      members: members.map((member) => ({
        ...member,
        label: member.label.trim() || getSegmentName(segments, member),
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
          onChange={(event) => setName(event.target.value)}
          data-autofocus
        />

        <Stack gap="sm">
          <Text fw="bold">{t`Members`}</Text>
          {members.length === 0 && (
            <Text c="text-secondary">{t`Add at least two segments.`}</Text>
          )}
          {members.map((member, index) => (
            <Group key={member.segmentId} gap="sm" wrap="nowrap">
              <Text c="text-secondary" w="1.5rem" ta="right" flex="0 0 auto">
                {index + 1}
              </Text>
              <TextInput
                aria-label={t`Label for ${getSegmentName(segments, member)}`}
                value={member.label}
                placeholder={getSegmentName(segments, member)}
                flex={1}
                onChange={(event) =>
                  setMembers(
                    members.map((known) =>
                      known.segmentId === member.segmentId
                        ? { ...known, label: event.target.value }
                        : known,
                    ),
                  )
                }
              />
              <ActionIcon
                aria-label={t`Move up`}
                disabled={index === 0}
                onClick={() => moveMember(index, -1)}
              >
                <Icon name="chevronup" />
              </ActionIcon>
              <ActionIcon
                aria-label={t`Move down`}
                disabled={index === members.length - 1}
                onClick={() => moveMember(index, 1)}
              >
                <Icon name="chevrondown" />
              </ActionIcon>
              <ActionIcon
                aria-label={t`Remove`}
                onClick={() =>
                  setMembers(
                    members.filter(
                      ({ segmentId }) => segmentId !== member.segmentId,
                    ),
                  )
                }
              >
                <Icon name="close" />
              </ActionIcon>
            </Group>
          ))}
          <Select
            aria-label={t`Add a segment`}
            placeholder={
              availableSegments.length > 0
                ? t`Add a segment`
                : t`No more segments on this table`
            }
            data={availableSegments.map(({ id, name }) => ({
              value: String(id),
              label: name,
            }))}
            value={null}
            disabled={availableSegments.length === 0}
            searchable
            onChange={(value) => {
              const segment = segments.find(({ id }) => String(id) === value);
              if (segment) {
                setMembers([
                  ...members,
                  { segmentId: segment.id, label: segment.name },
                ]);
              }
            }}
          />
        </Stack>

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
              description={t`Each row is in at most one member, so they can be compared side by side.`}
            />
            <Radio
              value="overlapping"
              label={getSegmentGroupKindLabel("overlapping")}
              description={t`A row can be in several members. Offered as filters, not as a Group by.`}
            />
          </Stack>
        </Radio.Group>

        {kind === "partition" && (
          <Switch
            label={t`Group the rest as Other`}
            description={t`Rows in no member show up last, as Other.`}
            checked={other}
            onChange={(event) => setOther(event.currentTarget.checked)}
          />
        )}

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

const getSegmentName = (segments: Segment[], member: SegmentGroupMember) =>
  segments.find(({ id }) => id === member.segmentId)?.name ?? member.label;
