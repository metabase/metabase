import { useState } from "react";
import { t } from "ttag";

import type {
  DeleteMappingModalValueType,
  GroupIds,
} from "metabase/admin/types";
import { Radio } from "metabase/common/components/Radio";
import { Box, Button, Group, Modal, Stack, Text } from "metabase/ui";

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

  const handleChange = (newValue: DeleteMappingModalValueType) => {
    setValue(newValue);
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
    <Modal opened onClose={onHide} title={t`Remove this group mapping?`}>
      <Stack gap="lg" mt="sm">
        <Text>{subtitle}</Text>

        <Box>
          <Text mb="sm">{whatShouldHappenText}</Text>
          <Box ml="md">
            <Radio
              vertical
              value={value}
              options={[
                {
                  name: t`Nothing, just remove the mapping`,
                  value: "nothing",
                },
                {
                  name: t`Also remove all group members (except from Admin)`,
                  value: "clear",
                },
                {
                  name:
                    groupIds.length > 1
                      ? t`Also delete the groups (except Admin)`
                      : t`Also delete the group`,
                  value: "delete",
                },
              ]}
              showButtons
              onChange={handleChange}
            />
          </Box>
        </Box>

        <Group justify="flex-end">
          <Button onClick={onHide}>{t`Cancel`}</Button>
          <Button variant="filled" color="error" onClick={handleConfirm}>
            {submitButtonLabels[value]}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
