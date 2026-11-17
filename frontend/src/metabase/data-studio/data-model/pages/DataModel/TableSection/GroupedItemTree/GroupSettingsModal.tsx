import { useState } from "react";
import { t } from "ttag";

import {
  Button,
  Group,
  Modal,
  Radio,
  Stack,
  Switch,
  TextInput,
} from "metabase/ui";

/** How a segment group's members relate; measure groups have no such setting */
export type PartitionSettings = {
  kind: "partition" | "overlapping";
  other: boolean;
};

export type GroupSettings = { name: string; partition?: PartitionSettings };

type GroupSettingsModalProps = {
  title: string;
  namePlaceholder: string;
  initialSettings: GroupSettings;
  /** Labels for the partition choice; absent hides it */
  partitionLabels?: Record<PartitionSettings["kind"], string>;
  onSave: (settings: GroupSettings) => void;
  onClose: () => void;
};

/**
 * PROTOTYPE: a group's own properties. Its members are added by dragging
 * items into it in the list, so they aren't picked here.
 */
export function GroupSettingsModal({
  title,
  namePlaceholder,
  initialSettings,
  partitionLabels,
  onSave,
  onClose,
}: GroupSettingsModalProps) {
  const [name, setName] = useState(initialSettings.name);
  const [partition, setPartition] = useState(initialSettings.partition);

  return (
    <Modal opened title={title} onClose={onClose}>
      <Stack gap="lg">
        <TextInput
          label={t`Name`}
          placeholder={namePlaceholder}
          value={name}
          required
          onChange={(event) => setName(event.target.value)}
          data-autofocus
        />
        {partition && partitionLabels && (
          <>
            <Radio.Group
              label={t`Kind`}
              value={partition.kind}
              onChange={(value) =>
                setPartition({
                  ...partition,
                  kind: value === "overlapping" ? value : "partition",
                })
              }
            >
              <Stack gap="sm" mt="sm">
                <Radio
                  value="partition"
                  label={partitionLabels.partition}
                  description={t`Each row belongs to only one segment so they can be compared side by side.`}
                />
                <Radio
                  value="overlapping"
                  label={partitionLabels.overlapping}
                  description={t`A row can be in several segments. These are offered only as filters, not as group bys.`}
                />
              </Stack>
            </Radio.Group>
            {partition.kind === "partition" && (
              <Switch
                label={t`Group the rest as Other`}
                description={t`Rows that don't belong to any segment show up last, within "Other".`}
                checked={partition.other}
                onChange={(event) =>
                  setPartition({
                    ...partition,
                    other: event.currentTarget.checked,
                  })
                }
              />
            )}
          </>
        )}
        <Group justify="flex-end" gap="sm">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            disabled={name.trim() === ""}
            onClick={() => onSave({ name: name.trim(), partition })}
          >
            {t`Save`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
