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

import { PublishConfirmationModal } from "./PublishConfirmationModal";

export type PublishTablesInput = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
};

export function usePublishTables() {
  const dispatch = useDispatch();
  const [publishTables, { isLoading: isPublishing }] =
    usePublishTablesMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [seenPublishTablesInfo, { ack: ackSeenPublishTablesInfo }] =
    useUserAcknowledgement("seen-publish-tables-info");
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const inputRef = useRef<PublishTablesInput | null>(null);

  const handlePublish = async (input: PublishTablesInput) => {
    if (seenPublishTablesInfo) {
      await handlePublishRequest(input);
    } else {
      inputRef.current = input;
      openModal();
    }
  };

  const handlePublishRequest = async (input: PublishTablesInput) => {
    const { data, error } = await publishTables({
      database_ids: input.databaseIds,
      schema_ids: input.schemaIds,
      table_ids: input.tableIds,
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

  const handleAcknowledgeSubmit = async (isAcknowledged: boolean) => {
    closeModal();
    if (isAcknowledged) {
      ackSeenPublishTablesInfo();
    }
    if (inputRef.current != null) {
      await handlePublishRequest(inputRef.current);
      inputRef.current = null;
    }
  };

  const publishConfirmationModal = (
    <PublishConfirmationModal
      isOpened={isModalOpened}
      onSubmit={handleAcknowledgeSubmit}
      onClose={closeModal}
    />
  );

  return { publishConfirmationModal, isPublishing, handlePublish };
}
