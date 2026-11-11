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
  type MeasureGroup,
  createMeasureGroupId,
  useMeasureGroups,
} from "metabase/metadata/measure-groups";
import { useNavigate } from "metabase/router";
import { Button, Card, Group, Select, Stack, Text } from "metabase/ui";
import type { MeasureId, Table } from "metabase-types/api";

const NAME_MAX_LENGTH = 254;

type MeasureGroupPageProps = {
  table: Table;
  /** The group to edit; none makes a new one */
  group: MeasureGroup | undefined;
  breadcrumbs: ReactNode;
  /** Where saving, deleting, or leaving goes: the table's measure groups */
  listUrl: string;
};

/**
 * PROTOTYPE: mocked. A measure group as a page, laid out like a new measure:
 * its name in the header, then its measures in order. Groups live in the
 * prototype's browser storage. Mount it fresh per group.
 */
export function MeasureGroupPage({
  table,
  group,
  breadcrumbs,
  listUrl,
}: MeasureGroupPageProps) {
  const navigate = useNavigate();
  const { saveMeasureGroup, deleteMeasureGroup } = useMeasureGroups();
  const { sendSuccessToast } = useMetadataToasts();
  const measures = table.measures ?? [];

  const [name, setName] = useState(group?.name ?? "");
  const [measureIds, setMeasureIds] = useState<MeasureId[]>(
    // Measures that were deleted drop out on the next save
    (group?.measureIds ?? []).filter((measureId) =>
      measures.some(({ id }) => id === measureId),
    ),
  );
  const [isLeaving, setIsLeaving] = useState(false);

  const availableMeasures = measures.filter(
    ({ id }) => !measureIds.includes(id),
  );
  const getMeasureName = (measureId: MeasureId) =>
    measures.find(({ id }) => id === measureId)?.name ?? "";
  const isDirty =
    name.trim() !== (group?.name ?? "") ||
    measureIds.join() !== (group?.measureIds ?? []).join();
  const isValid = name.trim() !== "" && measureIds.length > 0;

  // Saved, deleted, or cancelled: go once the leave guard is off
  const leave = () => setIsLeaving(true);
  useEffect(() => {
    if (isLeaving) {
      navigate(listUrl);
    }
  }, [isLeaving, listUrl, navigate]);

  const handleSave = () => {
    saveMeasureGroup(table, {
      id: group?.id ?? createMeasureGroupId(),
      name: name.trim(),
      measureIds,
      source: group?.source ?? "admin",
    });
    sendSuccessToast(
      group ? t`Measure group updated` : t`Measure group created`,
    );
    leave();
  };

  const handleDelete = () => {
    if (group) {
      deleteMeasureGroup(table, group.id);
      sendSuccessToast(t`Measure group deleted`);
      leave();
    }
  };

  return (
    <PageContainer data-testid="measure-group-page" gap="xxl">
      <PaneHeader
        data-testid="measure-group-pane-header"
        icon="folder"
        title={
          <PaneHeaderInput
            initialValue={group?.name ?? ""}
            isOptional
            maxLength={NAME_MAX_LENGTH}
            onContentChange={setName}
            placeholder={t`New measure group`}
          />
        }
        menu={
          group && (
            <MoreMenu
              onRemove={handleDelete}
              ariaLabel={t`Measure group actions`}
              removeLabel={t`Delete measure group`}
              removeTitle={t`Delete this measure group?`}
              removeMessage={t`Its measures stay; only the group is deleted.`}
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
        <Stack gap="sm" maw={720}>
          <Text fw="bold">{t`Measures`}</Text>
          <Select
            aria-label={t`Add a measure`}
            placeholder={
              availableMeasures.length > 0
                ? t`Add a measure`
                : t`No more measures on this table`
            }
            data={availableMeasures.map(({ id, name }) => ({
              value: String(id),
              label: name,
            }))}
            value={null}
            disabled={availableMeasures.length === 0}
            searchable
            onChange={(value) => {
              const measure = measures.find(({ id }) => String(id) === value);
              if (measure) {
                setMeasureIds([...measureIds, measure.id]);
              }
            }}
          />
          {measureIds.length === 0 ? (
            <Text c="text-secondary">{t`Add at least one measure.`}</Text>
          ) : (
            <GroupMemberList<MeasureId>
              items={measureIds}
              getId={(measureId) => measureId}
              getName={getMeasureName}
              renderContent={(measureId) => (
                <Text truncate>{getMeasureName(measureId)}</Text>
              )}
              onReorder={setMeasureIds}
              onRemove={(measureId) =>
                setMeasureIds(measureIds.filter((id) => id !== measureId))
              }
            />
          )}
        </Stack>
      </Card>
      <LeaveRouteConfirmModal isEnabled={isDirty && !isLeaving} />
    </PageContainer>
  );
}
