import { useState } from "react";
import { t } from "ttag";

import { useEditTablesMutation } from "metabase/api";
import {
  DataSourceInput,
  LayerInput,
  UserInput,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Flex, Modal, Stack, rem } from "metabase/ui";
import type {
  DatabaseId,
  SchemaId,
  TableDataSource,
  TableId,
  TableVisibilityType2,
  UserId,
} from "metabase-types/api";

interface Props {
  tables?: Set<TableId>;
  schemas?: Set<SchemaId>;
  databases?: Set<DatabaseId>;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function EditTableMetadataModal({
  tables = new Set(),
  schemas = new Set(),
  databases = new Set(),
  isOpen,
  onClose,
  onUpdate,
}: Props) {
  const [editTables, { isLoading }] = useEditTablesMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [visibilityType2, setVisibilityType2] =
    useState<TableVisibilityType2 | null>(null);
  const [dataSource, setDataSource] = useState<
    TableDataSource | "unknown" | null
  >(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<UserId | "unknown" | null>(null);

  const reset = () => {
    setVisibilityType2(null);
    setDataSource(null);
    setEmail(null);
    setUserId(null);
  };

  const handleSubmit = async () => {
    const { error } = await editTables({
      table_ids: Array.from(tables),
      schema_ids: Array.from(schemas),
      database_ids: Array.from(databases),
      visibility_type2: visibilityType2 ?? undefined,
      data_source: dataSource === "unknown" ? null : (dataSource ?? undefined),
      owner_email:
        userId === "unknown" || typeof userId === "number"
          ? null
          : (email ?? undefined),
      owner_user_id: userId === "unknown" ? null : (userId ?? undefined),
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
    email == null &&
    dataSource == null &&
    userId == null &&
    visibilityType2 == null;

  return (
    <Modal
      opened={isOpen}
      padding="xl"
      size={rem(512)}
      title={t`Edit selected tables`}
      onClose={handleClose}
    >
      <Stack gap="md" pt="sm">
        <LayerInput
          clearable
          value={visibilityType2}
          onChange={setVisibilityType2}
        />

        <UserInput
          clearable
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

        <DataSourceInput
          clearable
          value={dataSource}
          onChange={setDataSource}
        />

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
