import { useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Button, Group, Modal, Radio, Stack, Text } from "metabase/ui";

import type { DeleteMappingModalValueType, GroupIds } from "../types";

export type DeleteGroupMappingModalProps = {
  name: string;
  groupIds: GroupIds;
  // names of the mapped groups that clearing leaves alone
  keptOnClear?: string[];
  // names of the mapped groups that deleting leaves alone
  keptOnDelete?: string[];
  // an extra consequence the caller wants spelled out, shown under the lead text
  note?: string;
  onConfirm: (
    value: DeleteMappingModalValueType,
    groupIds: GroupIds,
    name: string,
  ) => void;
  onHide: () => void;
};

const NO_GROUPS: string[] = [];

function getKeptNote(names: string[]): string | null {
  if (names.length === 0) {
    return null;
  }
  if (names.length === 1) {
    return t`The ${names[0]} group is not affected.`;
  }
  return t`These groups are not affected: ${names.join(", ")}.`;
}

export const DeleteGroupMappingModal = ({
  name,
  groupIds,
  keptOnClear = NO_GROUPS,
  keptOnDelete = NO_GROUPS,
  note,
  onConfirm,
  onHide,
}: DeleteGroupMappingModalProps) => {
  const [value, setValue] = useState<DeleteMappingModalValueType>("nothing");
  const applicationName = useSelector(getApplicationName);
  const isPlural = groupIds.length > 1;
  const clearableCount = groupIds.length - keptOnClear.length;
  const deletableCount = groupIds.length - keptOnDelete.length;
  const canCascade = clearableCount > 0 || deletableCount > 0;
  const keptOnClearNote = getKeptNote(keptOnClear);
  const keptOnDeleteNote = getKeptNote(keptOnDelete);

  const handleChange = (newValue: DeleteMappingModalValueType) => {
    setValue(newValue);
  };

  const handleConfirm = () => {
    onConfirm(value, groupIds, name);
  };

  const submitButtonLabels: Record<DeleteMappingModalValueType, string> = {
    nothing: t`Remove mapping`,
    clear: t`Remove mapping and members`,
    delete: isPlural
      ? t`Remove mapping and delete groups`
      : t`Remove mapping and delete group`,
  };

  let lead: string;
  if (groupIds.length === 0) {
    lead = t`This mapping isn't linked to any group.`;
  } else if (isPlural) {
    lead = t`Membership of these groups will no longer be synced when users log in.`;
  } else {
    lead = t`Membership of this group will no longer be synced when users log in.`;
  }

  return (
    <Modal opened onClose={onHide} title={t`Remove this group mapping?`}>
      <Stack gap="xl" mt="sm">
        <Text>{lead}</Text>
        {note && <Text>{note}</Text>}
        {!canCascade && keptOnDeleteNote && <Text>{keptOnDeleteNote}</Text>}

        {canCascade && (
          <Box>
            <Text mb="lg">
              {isPlural
                ? t`What should happen with the groups themselves in ${applicationName}?`
                : t`What should happen with the group itself in ${applicationName}?`}
            </Text>
            <Radio.Group
              value={value}
              onChange={(newValue) =>
                // Unjustified type cast. FIXME
                handleChange(newValue as DeleteMappingModalValueType)
              }
            >
              <Stack gap="sm">
                <Radio
                  value="nothing"
                  label={t`Nothing, just remove the mapping`}
                />
                <Radio
                  value="clear"
                  disabled={clearableCount === 0}
                  label={
                    isPlural
                      ? t`Also remove all members from these groups`
                      : t`Also remove all members from this group`
                  }
                  description={
                    <>
                      {t`Members keep their ${applicationName} accounts.`}{" "}
                      {keptOnClearNote}
                    </>
                  }
                />
                <Radio
                  value="delete"
                  disabled={deletableCount === 0}
                  label={
                    isPlural
                      ? t`Also delete the groups`
                      : t`Also delete the group`
                  }
                  description={keptOnDeleteNote}
                />
              </Stack>
            </Radio.Group>
          </Box>
        )}

        <Group justify="flex-end">
          <Button onClick={onHide}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            color="feedback-negative"
            onClick={handleConfirm}
          >
            {submitButtonLabels[value]}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
