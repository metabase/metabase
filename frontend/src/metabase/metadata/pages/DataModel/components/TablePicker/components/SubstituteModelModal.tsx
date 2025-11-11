import { ThemeIcon } from "@mantine/core";
import { useState } from "react";
import { t } from "ttag";

import { useSubstituteModelMutation } from "metabase/api";
import Link from "metabase/common/components/Link/Link";
import {
  CollectionPickerModal,
  type CollectionPickerValueItem,
} from "metabase/common/components/Pickers/CollectionPicker";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Flex, Icon, List, Modal, Stack, Text, rem } from "metabase/ui";
import type { Card, TableId } from "metabase-types/api";

interface SubstituteModelModalProps {
  tableId: TableId;
  isOpen: boolean;
  onClose: () => void;
}

export function SubstituteModelModal({
  tableId,
  isOpen,
  onClose,
}: SubstituteModelModalProps) {
  const [substituteModel, { isLoading }] = useSubstituteModelMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] =
    useState<CollectionPickerValueItem | null>(null);
  const [createdModel, setCreatedModel] = useState<Card | null>(null);

  const reset = () => {
    setSelectedCollection(null);
    setIsCollectionPickerOpen(false);
    setCreatedModel(null);
  };

  const handleSubmit = async () => {
    if (!selectedCollection) {
      sendErrorToast(t`Please select a collection`);
      return;
    }

    const collectionId =
      selectedCollection.id === "root" ? null : Number(selectedCollection.id);

    const { error, data } = await substituteModel({
      id: tableId,
      collection_id: collectionId,
    });

    if (error) {
      sendErrorToast(t`Failed to create substitute model`);
    } else if (data?.model) {
      setCreatedModel(data.model);
      sendSuccessToast(
        t`Successfully created substitute model. All dependent entities now reference the model instead of the table.`,
      );
    }
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  return (
    <>
      <Modal
        opened={isOpen}
        padding="xl"
        size={rem(512)}
        title={
          createdModel
            ? t`Substitute model created`
            : t`Create substitute model`
        }
        onClose={handleClose}
      >
        {createdModel ? (
          <Stack gap="md" pt="sm">
            <Text>
              {t`Successfully created a substitute model. All entities that previously depended on this table now reference the model instead.`}
            </Text>

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
              <List.Item>
                <Button
                  component={Link}
                  h="auto"
                  p={0}
                  to={`/model/${createdModel.id}`}
                  size="xs"
                  variant="subtle"
                >
                  {createdModel.name}
                </Button>
              </List.Item>
            </List>

            {selectedCollection && (
              <Text
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: rem(4),
                }}
              >
                <span>{t`Model saved to `}</span>
                <Button
                  component={Link}
                  h="auto"
                  p={0}
                  to={`/collection/${selectedCollection.id}`}
                  size="xs"
                  variant="subtle"
                >
                  {selectedCollection.name}
                </Button>
              </Text>
            )}

            <Flex justify="flex-end" gap="sm">
              <Button onClick={handleClose}>{t`Close`}</Button>
            </Flex>
          </Stack>
        ) : (
          <Stack gap="md" pt="sm">
            <Text>
              {t`This will create a model that wraps this table. All entities that currently depend on this table will be updated to depend on the model instead.`}
            </Text>

            <Flex align="center" gap="sm">
              <Text>{t`Collection: `}</Text>
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
                {t`Create substitute model`}
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
            confirmButtonText: t`Select collection`,
          }}
          title={t`Select a collection for the model`}
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
