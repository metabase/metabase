import { useState } from "react";
import { t } from "ttag";

import {
  type MeasureGroup,
  createMeasureGroupId,
} from "metabase/metadata/measure-groups";
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type { Measure, MeasureId } from "metabase-types/api";

import { GroupMemberList } from "../GroupMemberList";

type MeasureGroupModalProps = {
  /** The group to edit; none makes a new one */
  group: MeasureGroup | undefined;
  measures: Measure[];
  onSave: (group: MeasureGroup) => void;
  onDelete: (groupId: string) => void;
  onClose: () => void;
};

/**
 * Names a group and picks its measures in order. Display only, so there's
 * nothing else to set. Mount it fresh per group.
 */
export function MeasureGroupModal({
  group,
  measures,
  onSave,
  onDelete,
  onClose,
}: MeasureGroupModalProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [measureIds, setMeasureIds] = useState<MeasureId[]>(
    // Measures that were deleted drop out on the next save
    (group?.measureIds ?? []).filter((measureId) =>
      measures.some(({ id }) => id === measureId),
    ),
  );

  const availableMeasures = measures.filter(
    ({ id }) => !measureIds.includes(id),
  );
  const canSave = name.trim() !== "" && measureIds.length > 0;
  const getMeasureName = (measureId: MeasureId) =>
    measures.find(({ id }) => id === measureId)?.name ?? "";

  return (
    <Modal
      opened
      title={group ? t`Edit measure group` : t`New measure group`}
      size="lg"
      onClose={onClose}
    >
      <Stack gap="lg">
        <TextInput
          label={t`Name`}
          placeholder={t`Revenue`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-autofocus
        />

        <Stack gap="sm">
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
            <Button
              variant="filled"
              disabled={!canSave}
              onClick={() =>
                onSave({
                  id: group?.id ?? createMeasureGroupId(),
                  name: name.trim(),
                  measureIds,
                  source: group?.source ?? "admin",
                })
              }
            >
              {t`Save`}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
