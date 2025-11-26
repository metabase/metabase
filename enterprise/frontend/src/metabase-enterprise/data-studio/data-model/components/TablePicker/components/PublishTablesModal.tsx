import { useState } from "react";
import { push } from "react-router-redux";
import { msgid, ngettext, t } from "ttag";

import {
  CollectionPickerModal,
  type CollectionPickerValueItem,
} from "metabase/common/components/Pickers/CollectionPicker";
import { useUserAcknowledgement } from "metabase/common/hooks/use-user-acknowledgement";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { Box, Button, Checkbox, Group, Modal, Text, rem } from "metabase/ui";
import { usePublishTablesMutation } from "metabase-enterprise/api";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import { getLibraryCollectionType } from "../../../../utils";

interface Props {
  tables?: Set<TableId>;
  schemas?: Set<SchemaId>;
  databases?: Set<DatabaseId>;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PublishTablesModal({
  tables = new Set(),
  schemas = new Set(),
  databases = new Set(),
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const dispatch = useDispatch();
  const [seenPublishTablesInfo, { ack: ackSeenPublishTablesInfo }] =
    useUserAcknowledgement("seen-publish-tables-info");
  const [showPublishInfo, setShowPublishInfo] = useState(
    !seenPublishTablesInfo,
  );
  const [publishTables] = usePublishTablesMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const libraryCollection =
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

    const { error, data } = await publishTables({
      table_ids: Array.from(tables),
      schema_ids: Array.from(schemas),
      database_ids: Array.from(databases),
      target_collection_id: collectionId,
    });

    if (error) {
      sendErrorToast(t`Failed to publish tables`);
    } else if (data) {
      const collectionLink =
        getLibraryCollectionType(collection.type) === "models"
          ? Urls.dataStudioCollection(collection.id)
          : Urls.collection(collection);
      sendSuccessToast(
        t`Published`,
        () => dispatch(push(collectionLink)),
        t`Go to ${collection.name}`,
      );
      onSuccess?.();
      handleClose();
    }
  };

  const handleClose = () => {
    setShowPublishInfo(!seenPublishTablesInfo);
    onClose?.();
  };

  if (!isOpen) {
    return null;
  }

  if (showPublishInfo && !seenPublishTablesInfo) {
    return (
      <AcknowledgePublishTablesModal
        isOpen={true}
        handleSubmit={({ acknowledged }) => {
          if (acknowledged) {
            ackSeenPublishTablesInfo();
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
        id: libraryCollection?.id || "root",
        model: "collection",
      }}
      options={{
        showSearch: true,
        hasConfirmButtons: true,
        showRootCollection: true,
        showPersonalCollections: true,
        confirmButtonText: t`Publish here`,
      }}
      title={getTitle(tables, schemas, databases)}
      onClose={() => {
        handleClose();
      }}
      onChange={(collection) => {
        handleSubmit(collection);
      }}
    />
  );
}

function getTitle(
  tables: Set<TableId>,
  schemas: Set<SchemaId>,
  databases: Set<DatabaseId>,
) {
  if (schemas.size === 0 && databases.size === 0) {
    return ngettext(
      msgid`Pick the collection to publish this table in`,
      `Pick the collection to publish these ${tables.size} tables in`,
      tables.size,
    );
  }
  return t`Pick the collection to publish these tables in`;
}

function AcknowledgePublishTablesModal({
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
        {t`Publishing a table means placing it in a collection in the Library so that it’s easy for your end users to find and use it in their explorations.`}
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
        >
          {t`Got it`}
        </Button>
      </Group>
    </Modal>
  );
}
