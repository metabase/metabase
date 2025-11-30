import { useDisclosure } from "@mantine/hooks";
import { useRef } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useUserAcknowledgement } from "metabase/common/hooks/use-user-acknowledgement";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { usePublishTablesMutation } from "metabase-enterprise/api";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import { CreateLibraryModal } from "../../components/CreateLibraryModal";

import { PublishAcknowledgementModal } from "./PublishAcknowledgementModal";

export type UsePublishTablesProps = {
  hasLibrary: boolean;
};

export type UsePublishTablesRequest = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
};

export function usePublishTables({ hasLibrary }: UsePublishTablesProps) {
  const dispatch = useDispatch();
  const [publishTables, { isLoading: isPublishing }] =
    usePublishTablesMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [seenPublishTablesInfo, { ack: ackSeenPublishTablesInfo }] =
    useUserAcknowledgement("seen-publish-tables-info");
  const [
    isLibraryModalOpened,
    { open: openLibraryModal, close: closeLibraryModal },
  ] = useDisclosure();
  const [
    isAcknowledgementModalOpened,
    { open: openAcknowledgementModal, close: closeAcknowledgementModal },
  ] = useDisclosure();
  const requestRef = useRef<UsePublishTablesRequest | null>(null);

  const handlePublish = async (input: UsePublishTablesRequest) => {
    requestRef.current = input;

    if (!hasLibrary) {
      openLibraryModal();
    } else if (!seenPublishTablesInfo) {
      openAcknowledgementModal();
    } else {
      await handlePublishRequest();
    }
  };

  const handlePublishRequest = async () => {
    const request = requestRef.current;
    if (request == null) {
      return;
    }

    const { data, error } = await publishTables({
      database_ids: request.databaseIds,
      schema_ids: request.schemaIds,
      table_ids: request.tableIds,
    });
    if (error) {
      sendErrorToast(t`Failed to publish tables`);
    } else if (data) {
      const { target_collection: collection } = data;
      sendSuccessToast(
        t`Published`,
        () => dispatch(push(Urls.dataStudioCollection(collection.id))),
        t`Go to ${collection.name}`,
      );
    }
  };

  const handleLibrarySubmit = async () => {
    closeLibraryModal();
    await handlePublishRequest();
  };

  const handleAcknowledgeSubmit = async (isAcknowledged: boolean) => {
    closeAcknowledgementModal();
    if (isAcknowledged) {
      ackSeenPublishTablesInfo();
    }
    await handlePublishRequest();
  };

  const publishConfirmationModal = (
    <>
      <CreateLibraryModal
        withPublishInfo
        isOpened={isLibraryModalOpened}
        onCreate={handleLibrarySubmit}
        onClose={closeLibraryModal}
      />
      <PublishAcknowledgementModal
        isOpened={isAcknowledgementModalOpened}
        onSubmit={handleAcknowledgeSubmit}
        onClose={closeAcknowledgementModal}
      />
    </>
  );

  return { publishConfirmationModal, isPublishing, handlePublish };
}
