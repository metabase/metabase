import { useState } from "react";
import { t } from "ttag";

import { useUpdateTableListMutation } from "metabase/api";
import { VisibilityInput } from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Flex, Modal, Stack, Text, rem } from "metabase/ui";
import type { TableId, TableVisibilityType2 } from "metabase-types/api";

interface Props {
  tables: Set<TableId>;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function EditVisibilityType2Modal({
  tables,
  isOpen,
  onClose,
  onUpdate,
}: Props) {
  const [updateTableList, { isLoading }] = useUpdateTableListMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [visibilityType2, setVisibilityType2] =
    useState<TableVisibilityType2>("copper");

  const handleSubmit = async () => {
    if (!visibilityType2) {
      return;
    }

    const { error } = await updateTableList({
      ids: Array.from(tables),
      visibility_type2: visibilityType2,
    });

    onUpdate?.();

    if (error) {
      sendErrorToast(t`Failed to update visibility type`);
    } else {
      sendSuccessToast(t`Visibility type updated`);
    }

    onClose();
    setVisibilityType2("copper");
  };

  const handleClose = () => {
    onClose();
    setVisibilityType2("copper");
  };

  return (
    <Modal
      opened={isOpen}
      padding="xl"
      size={rem(512)}
      title={t`Edit visibility type for ${tables.size} tables`}
      onClose={handleClose}
    >
      <Stack gap="md" pt="sm">
        <Text c="text-secondary" size="sm">
          {t`Edit visibility type for ${tables.size} tables`}
        </Text>

        <VisibilityInput
          value={visibilityType2}
          onChange={setVisibilityType2}
        />

        <Flex justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={handleClose} disabled={isLoading}>
            {t`Cancel`}
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isLoading}
            disabled={!visibilityType2}
          >
            {t`Update`}
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
}
