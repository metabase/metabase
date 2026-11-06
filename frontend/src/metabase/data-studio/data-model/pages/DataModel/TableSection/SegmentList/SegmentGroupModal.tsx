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
  Button,
  Group,
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
  // Required: an empty name turns red once someone has been in it and left
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isNameTouched, setIsNameTouched] = useState(false);
  const isNameMissing = isNameTouched && !isNameFocused && name.trim() === "";
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
  // A group can start empty and gain segments as they're made
  const canSave = name.trim() !== "";

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
          required
          error={isNameMissing}
          onChange={(event) => setName(event.target.value)}
          onFocus={() => setIsNameFocused(true)}
          onBlur={() => {
            setIsNameFocused(false);
            setIsNameTouched(true);
          }}
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
          {members.length > 0 && (
            <GroupMemberList<SegmentGroupMember>
              items={members}
              getId={({ segmentId }) => segmentId}
              getName={(member) => getSegmentName(segments, member)}
              renderContent={(member) => (
                <TextInput
                  aria-label={t`Label for ${getSegmentName(segments, member)}`}
                  value={member.label}
                  placeholder={getSegmentName(segments, member)}
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
              )}
              onReorder={setMembers}
              onRemove={(member) =>
                setMembers(
                  members.filter(
                    ({ segmentId }) => segmentId !== member.segmentId,
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

const getSegmentName = (segments: Segment[], member: SegmentGroupMember) =>
  segments.find(({ id }) => id === member.segmentId)?.name ?? member.label;
