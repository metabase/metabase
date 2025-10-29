import { useState } from "react";
import { t } from "ttag";

import { usePublishModelsMutation } from "metabase/api";
import {
  CollectionPickerModal,
  type CollectionPickerValueItem,
} from "metabase/common/components/Pickers/CollectionPicker";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Flex, Modal, Stack, Text, rem } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

interface Props {
  tables?: Set<TableId>;
  schemas?: Set<SchemaId>;
  databases?: Set<DatabaseId>;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PublishModelsModal({
  tables = new Set(),
  schemas = new Set(),
  databases = new Set(),
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const [publishModels, { isLoading }] = usePublishModelsMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] =
    useState<CollectionPickerValueItem | null>(null);

  const reset = () => {
    setSelectedCollection(null);
    setIsCollectionPickerOpen(false);
  };

  const handleSubmit = async () => {
    if (!selectedCollection || selectedCollection.id === "root") {
      sendErrorToast(t`Please select a collection`);
      return;
    }

    const { error, data } = await publishModels({
      table_ids: Array.from(tables),
      schema_ids: Array.from(schemas),
      database_ids: Array.from(databases),
      target_collection_id: Number(selectedCollection.id),
    });

    if (error) {
      sendErrorToast(t`Failed to publish models`);
    } else {
      const count = data?.created_count ?? 0;
      sendSuccessToast(
        t`Successfully published ${count} model${count !== 1 ? "s" : ""}`,
      );
      onSuccess?.();
    }

    // onClose();
    // reset();
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  const tableCount = tables.size;
  const schemaCount = schemas.size;
  const databaseCount = databases.size;

  const itemsDescription = (() => {
    const parts = [];
    if (tableCount > 0) {
      parts.push(t`${tableCount} table${tableCount !== 1 ? "s" : ""}`);
    }
    if (schemaCount > 0) {
      parts.push(t`${schemaCount} schema${schemaCount !== 1 ? "s" : ""}`);
    }
    if (databaseCount > 0) {
      parts.push(t`${databaseCount} database${databaseCount !== 1 ? "s" : ""}`);
    }
    return parts.join(", ");
  })();

  return (
    <>
      <Modal
        opened={isOpen}
        padding="xl"
        size={rem(512)}
        title={t`Publish models`}
        onClose={handleClose}
      >
        <Stack gap="md" pt="sm">
          <Text>
            {t`This will create a model for each selected table in the chosen collection.`}
          </Text>

          <Text size="sm" c="text-medium">
            {t`Selected items: ${itemsDescription}`}
          </Text>

          <Button
            variant="subtle"
            onClick={() => setIsCollectionPickerOpen(true)}
            style={{ justifyContent: "flex-start" }}
          >
            {selectedCollection
              ? selectedCollection.name
              : t`Choose a collection...`}
          </Button>

          <Flex justify="flex-end" gap="sm">
            <Button onClick={handleClose}>{t`Cancel`}</Button>

            <Button
              loading={isLoading}
              disabled={!selectedCollection}
              variant="filled"
              onClick={handleSubmit}
            >
              {t`Publish`}
            </Button>
          </Flex>
        </Stack>
      </Modal>
      {isCollectionPickerOpen && (
        <CollectionPickerModal
          value={{
            id: "root",
            model: "collection",
          }}
          options={{
            showSearch: true,
            hasConfirmButtons: true,
            showRootCollection: true,
            showPersonalCollections: true,
            confirmButtonText: t`Select for publishing`,
          }}
          title={t`Select a collection for publishing`}
          onClose={() => setIsCollectionPickerOpen(false)}
          onChange={(collection) => {
            setSelectedCollection(collection);
            setIsCollectionPickerOpen(false);
          }}
        />
      )}
    </>
  );
}
