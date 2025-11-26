import { useDisclosure } from "@mantine/hooks";
import { useRef } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useUserAcknowledgement } from "metabase/common/hooks/use-user-acknowledgement";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { usePublishTablesMutation } from "metabase-enterprise/api";
import type { PublishTablesRequest } from "metabase-types/api";

import { AcknowledgePublishTablesModal } from "./AcknowledgePublishTablesModal";

export function usePublishTables() {
  const dispatch = useDispatch();
  const [publishTables, { isLoading: isPublishing }] =
    usePublishTablesMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [seenPublishTablesInfo, { ack: ackSeenPublishTablesInfo }] =
    useUserAcknowledgement("seen-publish-tables-info");
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const requestRef = useRef<PublishTablesRequest | null>(null);

  const handlePublish = async (request: PublishTablesRequest) => {
    if (seenPublishTablesInfo) {
      await handlePublishRequest(request);
    } else {
      requestRef.current = request;
      openModal();
    }
  };

  const handlePublishRequest = async (request: PublishTablesRequest) => {
    const { data, error } = await publishTables(request);
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
    if (isAcknowledged) {
      ackSeenPublishTablesInfo();
    }
    if (requestRef.current != null) {
      await handlePublishRequest(requestRef.current);
      requestRef.current = null;
    }
  };

  const publishConfirmationModal = isModalOpened ? (
    <AcknowledgePublishTablesModal
      onSubmit={handleAcknowledgeSubmit}
      onClose={closeModal}
    />
  ) : null;

  return { publishConfirmationModal, isPublishing, handlePublish };
}
