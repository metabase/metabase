import { useState } from "react";
import { t } from "ttag";

import { useUpdateTableListMutation } from "metabase/api";
import { DataSourceInput, VisibilityInput } from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Flex, Modal, Stack, rem } from "metabase/ui";
import type {
  TableDataSource,
  TableId,
  TableVisibilityType2,
} from "metabase-types/api";

interface Props {
  tables: Set<TableId>;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function EditTableMetadataModal({
  tables,
  isOpen,
  onClose,
  onUpdate,
}: Props) {
  const [updateTableList, { isLoading }] = useUpdateTableListMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [visibilityType2, setVisibilityType2] =
    useState<TableVisibilityType2>("copper");
  const [dataSource, setDataSource] = useState<TableDataSource | null>(null);

  const reset = () => {
    setVisibilityType2("copper");
    setDataSource(null);
  };

  const handleSubmit = async () => {
    if (!visibilityType2 || !dataSource) {
      return;
    }

    const { error } = await updateTableList({
      ids: Array.from(tables),
      visibility_type2: visibilityType2,
      data_source: dataSource,
    });

    onUpdate?.();

    if (error) {
      sendErrorToast(t`Failed to update visibility type`);
    } else {
      sendSuccessToast(t`Visibility type updated`);
    }

    onClose();
    reset();
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  return (
    <Modal
      opened={isOpen}
      padding="xl"
      size={rem(512)}
      title={t`Edit ${tables.size} tables`}
      onClose={handleClose}
    >
      <Stack gap="md" pt="sm">
        <VisibilityInput
          value={visibilityType2}
          onChange={setVisibilityType2}
        />

        <DataSourceInput value={dataSource} onChange={setDataSource} />

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
