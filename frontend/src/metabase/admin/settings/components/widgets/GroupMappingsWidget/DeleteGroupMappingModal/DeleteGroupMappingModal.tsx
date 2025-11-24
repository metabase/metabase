import { useState } from "react";
import { t } from "ttag";

import type {
  DeleteMappingModalValueType,
  GroupIds,
} from "metabase/admin/types";
import { Button, Flex, Modal, Radio, Stack, Text } from "metabase/ui";

export type DeleteGroupMappingModalProps = {
  name: string;
  groupIds: GroupIds;
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
  onConfirm,
  onHide,
}: DeleteGroupMappingModalProps) => {
  const [value, setValue] = useState<DeleteMappingModalValueType>("nothing");

  const handleChange = (newValue: string) => {
    setValue(newValue as DeleteMappingModalValueType);
  };

  const handleConfirm = () => {
    onConfirm(value, groupIds, name);
  };

  const submitButtonLabels: Record<DeleteMappingModalValueType, string> = {
    nothing: t`Remove mapping`,
    clear: t`Remove mapping and members`,
    delete:
      groupIds.length > 1
        ? t`Remove mapping and delete groups`
        : t`Remove mapping and delete group`,
  };

  const subtitle =
    groupIds.length > 1
      ? t`These groups' user memberships will no longer be synced with the directory server.`
      : t`This group's user membership will no longer be synced with the directory server.`;

  const whatShouldHappenText =
    groupIds.length > 1
      ? t`What should happen with the groups themselves in Metabase?`
      : t`What should happen with the group itself in Metabase?`;

  return (
    <Modal
      title={t`Remove this group mapping?`}
      opened
      onClose={onHide}
      size="lg"
    >
      <Stack gap="md">
        <Text>{subtitle}</Text>
        <Text fw={500}>{whatShouldHappenText}</Text>

        <Radio.Group value={value} onChange={handleChange}>
          <Stack gap="sm" ml="md">
            <Radio
              value="nothing"
              label={t`Nothing, just remove the mapping`}
            />
            <Radio
              value="clear"
              label={t`Also remove all group members (except from Admin)`}
            />
            <Radio
              value="delete"
              label={
                groupIds.length > 1
                  ? t`Also delete the groups (except Admin)`
                  : t`Also delete the group`
              }
            />
          </Stack>
        </Radio.Group>

        <Flex justify="flex-end" gap="md" mt="md">
          <Button onClick={onHide}>{t`Cancel`}</Button>
          <Button color="danger" variant="filled" onClick={handleConfirm}>
            {submitButtonLabels[value]}
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
};
