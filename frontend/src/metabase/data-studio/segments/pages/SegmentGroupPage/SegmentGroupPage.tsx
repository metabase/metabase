import { type ReactNode, useEffect, useState } from "react";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/common/data-studio/components/PaneHeader";
import { useMetadataToasts } from "metabase/common/hooks";
import { MoreMenu } from "metabase/data-studio/common/components/MoreMenu/MoreMenu";
import { GroupMemberList } from "metabase/data-studio/data-model/pages/DataModel/TableSection/GroupMemberList";
import {
  type ResolvedSystemSegment,
  isUsableSystemSegment,
  useTableSegmentsModel,
} from "metabase/data-studio/data-model/pages/DataModel/TableSection/table-segments";
import {
  type SegmentGroup,
  type SegmentGroupKind,
  type SegmentGroupMember,
  createSegmentGroupId,
  getSegmentGroupKindLabel,
  getSegmentGroupMemberKey,
  isSegmentGroupMemberPresent,
  useSegmentGroups,
} from "metabase/metadata/segment-groups";
import { useNavigate } from "metabase/router";
import {
  Button,
  Card,
  Group,
  Icon,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "metabase/ui";
import type { Segment, Table } from "metabase-types/api";

const NAME_MAX_LENGTH = 254;

type SegmentGroupPageProps = {
  table: Table;
  /** The group to edit; none makes a new one */
  group: SegmentGroup | undefined;
  breadcrumbs: ReactNode;
  /** Where saving, deleting, or leaving goes: the table's segment groups */
  listUrl: string;
};

/**
 * PROTOTYPE: mocked. A segment group as a page, laid out like a new segment:
 * its name in the header, then its kind and its segments in order. Groups
 * live in the prototype's browser storage. Mount it fresh per group.
 */
export function SegmentGroupPage({
  table,
  group,
  breadcrumbs,
  listUrl,
}: SegmentGroupPageProps) {
  const navigate = useNavigate();
  const { saveSegmentGroup, deleteSegmentGroup } = useSegmentGroups();
  const { sendSuccessToast } = useMetadataToasts();
  const segments = table.segments ?? [];
  const { systemSegments } = useTableSegmentsModel(table);

  const [name, setName] = useState(group?.name ?? "");
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
  const [isLeaving, setIsLeaving] = useState(false);

  const memberKeys = new Set(members.map(getSegmentGroupMemberKey));
  const availableOptions = [
    ...segments.map((segment) => ({
      member: { segmentId: segment.id, label: segment.name },
      label: segment.name,
    })),
    ...systemSegments.filter(isUsableSystemSegment).map((segment) => ({
      member: { systemRole: segment.role, label: segment.label },
      label: segment.label,
    })),
  ].filter(({ member }) => !memberKeys.has(getSegmentGroupMemberKey(member)));
  const getMemberName = (member: SegmentGroupMember) =>
    getSegmentGroupMemberName(member, segments, systemSegments);
  const isDirty =
    name.trim() !== (group?.name ?? "") ||
    kind !== (group?.kind ?? "partition") ||
    other !== (group?.other ?? false) ||
    JSON.stringify(members) !== JSON.stringify(group?.members ?? []);
  // A group can start empty and gain segments as they're made
  const isValid = name.trim() !== "";

  // Saved, deleted, or cancelled: go once the leave guard is off
  const leave = () => setIsLeaving(true);
  useEffect(() => {
    if (isLeaving) {
      navigate(listUrl);
    }
  }, [isLeaving, listUrl, navigate]);

  const handleSave = () => {
    saveSegmentGroup(table, {
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
    sendSuccessToast(
      group ? t`Segment group updated` : t`Segment group created`,
    );
    leave();
  };

  const handleDelete = () => {
    if (group) {
      deleteSegmentGroup(table, group.id);
      sendSuccessToast(t`Segment group deleted`);
      leave();
    }
  };

  return (
    <PageContainer data-testid="segment-group-page" gap="xxl">
      <PaneHeader
        data-testid="segment-group-pane-header"
        icon="segment_group"
        title={
          <PaneHeaderInput
            initialValue={group?.name ?? ""}
            isOptional
            maxLength={NAME_MAX_LENGTH}
            onContentChange={setName}
            placeholder={t`New segment group`}
          />
        }
        menu={
          group && (
            <MoreMenu
              onRemove={handleDelete}
              ariaLabel={t`Segment group actions`}
              removeLabel={t`Delete segment group`}
              removeTitle={t`Delete this segment group?`}
              removeMessage={t`Its segments stay; only the group is deleted.`}
            />
          )
        }
        actions={
          isDirty && (
            <Group gap="sm">
              {group && <Button onClick={leave}>{t`Cancel`}</Button>}
              <Button variant="filled" disabled={!isValid} onClick={handleSave}>
                {t`Save`}
              </Button>
            </Group>
          )
        }
        breadcrumbs={breadcrumbs}
      />
      <Card withBorder p="xxl">
        <Stack gap="xxl" maw={720}>
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
        </Stack>
      </Card>
      <LeaveRouteConfirmModal isEnabled={isDirty && !isLeaving} />
    </PageContainer>
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
