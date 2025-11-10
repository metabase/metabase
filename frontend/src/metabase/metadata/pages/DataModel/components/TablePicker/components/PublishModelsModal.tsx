import { ThemeIcon } from "@mantine/core";
import { useState } from "react";
import { t } from "ttag";

import { usePublishModelsMutation } from "metabase/api";
import Link from "metabase/common/components/Link/Link";
import {
  CollectionPickerModal,
  type CollectionPickerValueItem,
} from "metabase/common/components/Pickers/CollectionPicker";
import { useUserAcknowledgement } from "metabase/common/hooks/use-user-acknowledgement";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Group,
  Icon,
  List,
  Modal,
  Stack,
  Text,
  rem,
} from "metabase/ui";
import type {
  Card,
  DatabaseId,
  SchemaId,
  TableId,
  PublishModelsResponse,
} from "metabase-types/api";
import * as urls from "metabase/lib/urls";

interface Props {
  tables?: Set<TableId>;
  schemas?: Set<SchemaId>;
  databases?: Set<DatabaseId>;
  isOpen: boolean;
  onClose?: () => void;
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
  const [seenPublishModelsInfo, { ack: ackSeenPublishModelsInfo }] =
    useUserAcknowledgement("seen-publish-models-info");
  const [showPublishInfo, setShowPublishInfo] = useState(
    !seenPublishModelsInfo,
  );
  const [publishModels] = usePublishModelsMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleSubmit = async (collection: CollectionPickerValueItem) => {
    if (!collection) {
      sendErrorToast(t`Please select a collection`);
      return;
    }

    const collectionId =
      collection.id === "root" ? null : Number(collection.id);

    const { error, data } = await publishModels({
      table_ids: Array.from(tables),
      schema_ids: Array.from(schemas),
      database_ids: Array.from(databases),
      target_collection_id: collectionId,
    });

    if (error) {
      sendErrorToast(t`Failed to publish models`);
    } else if (data) {
      sendSuccessToast(<ToastSuccessMessage response={data} />);
      onSuccess?.();
      handleClose();
    }
  };

  const handleClose = () => {
    setShowPublishInfo(!seenPublishModelsInfo);
    onClose?.();
  };

  if (!isOpen) {
    return null;
  }
  if (showPublishInfo) {
    return (
      <AcknowledgePublishModelsModal
        isOpen={true}
        handleClose={({ acknowledged }) => {
          if (acknowledged) {
            ackSeenPublishModelsInfo();
          }
          setShowPublishInfo(false);
        }}
      />
    );
  }

  return (
    <>
      {
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
            confirmButtonText: t`Publish here`,
          }}
          title={t`Pick the collection to publish this table in`}
          onClose={() => {
            handleClose();
          }}
          onChange={(collection) => {
            handleSubmit(collection);
          }}
        />
      }
    </>
  );
}

function ToastSuccessMessage({
  response,
}: {
  response: PublishModelsResponse;
}) {
  return (
    <Group gap="xl" display="inline-flex" align="center" wrap="nowrap">
      <span>{t`Published`}</span>
      <Button
        component={Link}
        to={getLink(response)}
        variant="subtle"
      >{t`See it`}</Button>
    </Group>
  );
}

function getLink(response: PublishModelsResponse) {
  if (response.created_count === 1) {
    return urls.model(response.models[0]); // link to model
  }

  return urls.collection(response.target_collection);
}

function AcknowledgePublishModelsModal({
  isOpen,
  handleClose,
}: {
  isOpen: boolean;
  handleClose: ({ acknowledged }: { acknowledged: boolean }) => void;
}) {
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  return (
    <Modal
      opened={isOpen}
      padding="xl"
      size={rem(512)}
      title={t`What publishing a table does`}
      onClose={() => handleClose({ acknowledged: isAcknowledged })}
    >
      <Text>
        {t`Publishing a table means we'll create a model based on it and save it in the collection you choose so that it’s easy for your end users to find it.`}
      </Text>

      <Group pt="xl" justify="space-between">
        <Box>
          <Checkbox
            label={t`Don’t show this to me again`}
            checked={isAcknowledged}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setIsAcknowledged(event.target.checked)
            }
          />
        </Box>
        <Button
          onClick={() => handleClose({ acknowledged: isAcknowledged })}
          variant="filled"
        >{t`Got it`}</Button>
      </Group>
    </Modal>
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
