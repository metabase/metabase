import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateTableSymlinkMutation } from "metabase/api";
import {
  CollectionPickerModal,
  type CollectionPickerValueItem,
} from "metabase/common/components/Pickers/CollectionPicker";
import { useUserAcknowledgement } from "metabase/common/hooks/use-user-acknowledgement";
import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { Box, Button, Checkbox, Group, Modal, Text, rem } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import { getPublishSeeItLink } from "../utils";

interface Props {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
  isOpen: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

export function PublishModelsModal({
  databaseIds = [],
  schemaIds = [],
  tableIds = [],
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const dispatch = useDispatch();
  const [seenPublishModelsInfo, { ack: ackSeenPublishModelsInfo }] =
    useUserAcknowledgement("seen-publish-models-info");
  const [showPublishInfo, setShowPublishInfo] = useState(
    !seenPublishModelsInfo,
  );
  const [createTableSymlink] = useCreateTableSymlinkMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const defaultPublishCollection =
    PLUGIN_DATA_STUDIO.useGetLibraryChildCollectionByType({
      type: "library-models",
    });

  const handleSubmit = async (collection: CollectionPickerValueItem) => {
    if (!collection) {
      sendErrorToast(t`Please select a collection`);
      return;
    }

    const collectionId =
      collection.id === "root" ? null : Number(collection.id);

    const { error, data } = await createTableSymlink({
      collection_id: collectionId,
      database_ids: databaseIds,
      schema_ids: schemaIds,
      table_ids: tableIds,
    });

    if (error) {
      sendErrorToast(t`Failed to publish models`);
    } else if (data) {
      sendSuccessToast(
        t`Published`,
        () => {
          dispatch(push(getPublishSeeItLink(data)));
        },
        t`See it`,
      );
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

  if (showPublishInfo && !seenPublishModelsInfo) {
    return (
      <AcknowledgePublishModelsModal
        isOpen={true}
        handleSubmit={({ acknowledged }) => {
          if (acknowledged) {
            ackSeenPublishModelsInfo();
          }
          setShowPublishInfo(false);
        }}
        handleClose={() => {
          handleClose();
        }}
      />
    );
  }

  return (
    <CollectionPickerModal
      value={{
        id: defaultPublishCollection?.id || "root",
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
  );
}

function AcknowledgePublishModelsModal({
  isOpen,
  handleSubmit,
  handleClose,
}: {
  isOpen: boolean;
  handleSubmit: ({ acknowledged }: { acknowledged: boolean }) => void;
  handleClose: () => void;
}) {
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  return (
    <Modal
      opened={isOpen}
      padding="xl"
      size={rem(512)}
      title={t`What publishing a table does`}
      onClose={() => handleClose()}
    >
      <Text pt="sm">
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
          onClick={() => handleSubmit({ acknowledged: isAcknowledged })}
          variant="filled"
        >{t`Got it`}</Button>
      </Group>
    </Modal>
  );
}
