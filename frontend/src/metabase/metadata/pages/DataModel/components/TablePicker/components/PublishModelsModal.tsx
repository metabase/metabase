import { ThemeIcon } from "@mantine/core";
import { useState } from "react";
import { t } from "ttag";

import { usePublishModelsMutation } from "metabase/api";
import Link from "metabase/common/components/Link/Link";
import {
  CollectionPickerModal,
  type CollectionPickerValueItem,
} from "metabase/common/components/Pickers/CollectionPicker";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Flex, Icon, List, Modal, Stack, Text, rem } from "metabase/ui";
import type { Card, DatabaseId, SchemaId, TableId } from "metabase-types/api";

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
  const { sendErrorToast } = useMetadataToasts();
  const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] =
    useState<CollectionPickerValueItem | null>(null);
  const [publishedModels, setPublishedModels] = useState<Card[] | null>(null);

  const reset = () => {
    setSelectedCollection(null);
    setIsCollectionPickerOpen(false);
    setPublishedModels(null);
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
      setPublishedModels(data?.models ?? []);
      onSuccess?.();
    }
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
        title={publishedModels ? t`Create models` : t`Created models`}
        onClose={handleClose}
      >
        {publishedModels ? (
          <PublishedModelsList
            publishedModels={publishedModels}
            handleClose={handleClose}
            collection={selectedCollection}
          />
        ) : (
          <Stack gap="md" pt="sm">
            <Text>
              {t`This will create a model for each selected table in the chosen collection.`}
            </Text>

            <Text size="sm" c="text-medium">
              {t`Selected items: ${itemsDescription}`}
            </Text>

            <Flex align="center" gap="sm">
              <Text>{t`Collection to publish to: `}</Text>
              <Button
                size="xs"
                leftSection={
                  selectedCollection ? <Icon name="collection" /> : undefined
                }
                variant="default"
                onClick={() => setIsCollectionPickerOpen(true)}
                style={{ justifyContent: "flex-start" }}
              >
                {selectedCollection
                  ? selectedCollection.name
                  : t`Choose a collection...`}
              </Button>
            </Flex>

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
        )}
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

function PublishedModelsList({
  publishedModels,
  collection,
  handleClose,
}: {
  publishedModels: Card[];
  collection: CollectionPickerValueItem | null;
  handleClose: () => void;
}) {
  return (
    <Stack gap="md" pt="sm">
      <Text
        px={0}
        style={{ display: "inline-flex", alignItems: "baseline", gap: rem(4) }}
      >
        <span>{t`Successfully published ${publishedModels.length} model${publishedModels.length !== 1 ? "s" : ""} to `}</span>
        {collection ? (
          <Button
            component={Link}
            h="auto"
            p={0}
            to={`/collection/${collection?.id}`}
            size="xs"
            variant="subtle"
          >
            {collection?.name}
          </Button>
        ) : null}
      </Text>
      <Text>
        <List
          spacing="xs"
          px={0}
          center
          icon={
            <ThemeIcon radius="xl" color="white">
              <Icon name="model_with_badge" c="brand" />
            </ThemeIcon>
          }
        >
          {publishedModels.map((model) => (
            <List.Item key={model.id}>
              <Button
                component={Link}
                h="auto"
                p={0}
                to={`/model/${model.id}`}
                size="xs"
                variant="subtle"
              >
                {model.name}
              </Button>
            </List.Item>
          ))}
        </List>
      </Text>

      <Flex justify="flex-end" gap="sm">
        <Button onClick={handleClose}>{t`Close`}</Button>
      </Flex>
    </Stack>
  );
}
