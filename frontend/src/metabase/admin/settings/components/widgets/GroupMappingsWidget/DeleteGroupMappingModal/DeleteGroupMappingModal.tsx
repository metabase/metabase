import { useState } from "react";
import { t } from "ttag";

import type {
  DeleteMappingModalValueType,
  GroupIds,
} from "metabase/admin/types";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Button, Group, Modal, Radio, Stack, Text } from "metabase/ui";

export type DeleteGroupMappingModalProps = {
  name: string;
  groupIds: GroupIds;
  // the Administrators group is never cleared or deleted, so the copy says so when it is mapped
  hasAdminGroup?: boolean;
  // an extra consequence the caller wants spelled out, shown under the lead text
  note?: string;
  onConfirm: (
    value: DeleteMappingModalValueType,
    groupIds: GroupIds,
    name: string,
  ) => void;
  onHide: () => void;
};

export const DeleteGroupMappingModal = ({
  name,
  groupIds,
  hasAdminGroup = false,
  note,
  onConfirm,
  onHide,
}: DeleteGroupMappingModalProps) => {
  const [value, setValue] = useState<DeleteMappingModalValueType>("nothing");
  const applicationName = useSelector(getApplicationName);
  const isPlural = groupIds.length > 1;
  // with only the Administrators group, or no group at all, there is nothing a cascade could touch
  const canCascade = groupIds.length > (hasAdminGroup ? 1 : 0);

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

  const adminNote = hasAdminGroup
    ? t`The Administrators group is not affected.`
    : null;

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
        {!canCascade && adminNote && <Text>{adminNote}</Text>}

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
                  label={
                    isPlural
                      ? t`Also remove all members from these groups`
                      : t`Also remove all members from this group`
                  }
                  description={
                    <>
                      {t`Members keep their ${applicationName} accounts.`}{" "}
                      {adminNote}
                    </>
                  }
                />
                <Radio
                  value="delete"
                  label={
                    isPlural
                      ? t`Also delete the groups`
                      : t`Also delete the group`
                  }
                  description={adminNote}
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
