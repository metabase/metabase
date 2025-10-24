import { useState } from "react";
import { t } from "ttag";

import { useEditTablesMutation } from "metabase/api";
import {
  DataSourceInput,
  LayerInput,
  UserInput,
  VisibilityInput,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Flex, Modal, Stack, rem } from "metabase/ui";
import type {
  SchemaId,
  TableDataSource,
  TableId,
  TableVisibilityType,
  TableVisibilityType2,
  UserId,
} from "metabase-types/api";

interface Props {
  tables?: Set<TableId>;
  schemas?: Set<SchemaId>;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function EditTableMetadataModal({
  tables = new Set(),
  schemas = new Set(),
  isOpen,
  onClose,
  onUpdate,
}: Props) {
  const [editTables, { isLoading }] = useEditTablesMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [visibilityType, setVisibilityType] = useState<
    TableVisibilityType | undefined
  >(undefined);
  const [visibilityType2, setVisibilityType2] = useState<
    TableVisibilityType2 | undefined
  >(undefined);
  const [dataSource, setDataSource] = useState<
    TableDataSource | null | undefined
  >(undefined);
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [userId, setUserId] = useState<UserId | null | undefined>(undefined);

  const reset = () => {
    setVisibilityType(undefined);
    setVisibilityType2(undefined);
    setDataSource(undefined);
    setEmail(undefined);
    setUserId(undefined);
  };

  const handleSubmit = async () => {
    const { error } = await editTables({
      table_ids: Array.from(tables),
      schema_ids: Array.from(schemas),
      visibility_type: visibilityType,
      visibility_type2: visibilityType2,
      data_source: dataSource,
      owner_email: email,
      owner_user_id: userId,
    });

    onUpdate?.();

    if (error) {
      sendErrorToast(t`Failed to update items`);
    } else {
      sendSuccessToast(t`Items updated`);
    }

    onClose();
    reset();
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  const disabled =
    typeof email === "undefined" &&
    typeof dataSource === "undefined" &&
    typeof userId === "undefined" &&
    typeof visibilityType === "undefined" &&
    typeof visibilityType2 === "undefined";

  const count = tables.size + schemas.size;

  return (
    <Modal
      opened={isOpen}
      padding="xl"
      size={rem(512)}
      title={t`Edit ${count} items`}
      onClose={handleClose}
    >
      <Stack gap="md" pt="sm">
        <VisibilityInput value={visibilityType} onChange={setVisibilityType} />

        <LayerInput value={visibilityType2} onChange={setVisibilityType2} />

        <UserInput
          email={email}
          label={t`Owner`}
          userId={userId}
          onEmailChange={(email) => {
            setEmail(email);
            setUserId(null);
          }}
          onUserIdChange={(userId) => {
            setEmail(null);
            setUserId(userId);
          }}
        />

        <DataSourceInput value={dataSource} onChange={setDataSource} />

        <Flex justify="flex-end" gap="sm">
          <Button onClick={handleClose}>{t`Cancel`}</Button>

          <Button
            loading={isLoading}
            disabled={disabled}
            variant="primary"
            onClick={handleSubmit}
          >
            {t`Update`}
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
}
