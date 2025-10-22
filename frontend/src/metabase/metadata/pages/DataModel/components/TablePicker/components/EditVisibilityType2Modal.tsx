import { useState } from "react";
import { t } from "ttag";

import { useUpdateTableListMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Flex, Modal, Select, Stack, Text, rem } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  tables: Set<TableId>;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

const VISIBILITY_TYPE_OPTIONS = [
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "normal", label: "Normal" },
  { value: "hidden", label: "Hidden" },
];

export function EditVisibilityType2Modal({
  tables,
  isOpen,
  onClose,
  onUpdate,
}: Props) {
  const [updateTableList, { isLoading }] = useUpdateTableListMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [visibilityType2, setVisibilityType2] = useState<string | null>(null);

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
    setVisibilityType2(null);
  };

  const handleClose = () => {
    onClose();
    setVisibilityType2(null);
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

        <Select
          label={t`Visibility Type`}
          placeholder={t`Select visibility type`}
          value={visibilityType2}
          onChange={setVisibilityType2}
          data={VISIBILITY_TYPE_OPTIONS}
          data-testid="visibility-type2-select"
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
