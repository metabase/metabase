import { type Ref, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { trackDataStudioCleanupPublicationStarted } from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { Flex, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  usageMetadataApi,
  useGetUsageMetadataCandidateQuery,
  useRestoreUsageMetadataCandidateMutation,
} from "metabase-enterprise/api";
import type { UsageMetadataCandidateType } from "metabase-types/api";

import { useCandidateAction } from "../hooks/useCandidateAction";
import { isCreationCandidate, isStaleCandidateError } from "../utils";

import S from "./CandidatePanel.module.css";
import { CandidatePanelBody } from "./CandidatePanelBody";
import { CreateCandidateModal } from "./CreateCandidateModal";
import { DismissCandidateModal } from "./DismissCandidateModal";

type CandidatePanelProps = {
  panelRef?: Ref<HTMLDivElement>;
  candidateId: number;
  onClose: () => void;
  onStale: () => void;
  onTablePublished: () => void;
};

export function CandidatePanel({
  panelRef,
  candidateId,
  onClose,
  onStale,
  onTablePublished,
}: CandidatePanelProps) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const staleCandidateId = useRef<number | undefined>(undefined);
  const { sendSuccessToast } = useMetadataToasts();
  const candidateQuery = useGetUsageMetadataCandidateQuery(candidateId);
  const [restoreCandidate] = useRestoreUsageMetadataCandidateMutation();
  const runCandidateAction = useCandidateAction();
  const candidate = candidateQuery.data;

  useEffect(() => {
    if (
      candidateId != null &&
      isStaleCandidateError(candidateQuery.error) &&
      staleCandidateId.current !== candidateId
    ) {
      staleCandidateId.current = candidateId;
      onStale();
    }
  }, [candidateId, candidateQuery.error, onStale]);

  const handleStale = () => {
    setShowCreateModal(false);
    setShowDismissModal(false);
    onStale();
  };

  const handleCreated = (type: UsageMetadataCandidateType, id: number) => {
    setShowCreateModal(false);
    if (!candidate || (type !== "measure" && type !== "segment")) {
      return;
    }
    const url =
      type === "measure"
        ? Urls.dataStudioPublishedTableMeasure(candidate.table.id, id)
        : Urls.dataStudioPublishedTableSegment(candidate.table.id, id);
    sendSuccessToast(
      type === "measure" ? t`Measure created` : t`Segment created`,
      () => navigate(url),
      t`View in Library`,
    );
  };

  const handleRestore = async ({ showToast = true } = {}) => {
    if (!candidate) {
      return;
    }
    await runCandidateAction({
      action: "restore",
      candidate,
      request: () => restoreCandidate(candidate.id).unwrap(),
      errorMessage: t`The candidate could not be restored`,
      onStale: handleStale,
      onSuccess: () => {
        onClose();
        if (showToast) {
          sendSuccessToast(t`Candidate restored`);
        }
      },
    });
  };

  const handleDismissSuccess = () => {
    if (!candidate) {
      return;
    }
    setShowDismissModal(false);
    onClose();
    sendSuccessToast(
      t`Candidate dismissed`,
      () => handleRestore({ showToast: false }),
      t`Undo`,
    );
  };

  const handlePublished = () => {
    setShowPublishModal(false);
    dispatch(
      usageMetadataApi.util.invalidateTags([
        { type: "usage-metadata-candidate", id: "LIST" },
      ]),
    );
    candidateQuery.refetch();
    onTablePublished();
  };

  return (
    <>
      <Stack
        ref={panelRef}
        className={S.panel}
        h="100%"
        miw={450}
        maw="100%"
        flex="4 1 0"
        gap={0}
        bg="background_page-secondary"
        role="complementary"
        aria-label={t`Candidate report`}
        data-testid="cleanup-candidate-panel"
      >
        {candidateQuery.isFetching && candidate == null ? (
          <Flex h="100%" align="center" justify="center">
            <LoadingAndErrorWrapper loading />
          </Flex>
        ) : candidateQuery.error && candidate == null ? (
          <Flex h="100%" align="center" justify="center">
            <LoadingAndErrorWrapper error={candidateQuery.error} />
          </Flex>
        ) : candidate != null ? (
          <CandidatePanelBody
            candidate={candidate}
            onClose={onClose}
            onCreate={() => setShowCreateModal(true)}
            onDismiss={() => setShowDismissModal(true)}
            onRestore={handleRestore}
            onPublish={() => {
              trackDataStudioCleanupPublicationStarted(
                Number(candidate.table.id),
              );
              setShowPublishModal(true);
            }}
          />
        ) : (
          <Flex h="100%" align="center" justify="center">
            <LoadingAndErrorWrapper loading />
          </Flex>
        )}
      </Stack>
      {candidate && (
        <>
          {showCreateModal && isCreationCandidate(candidate) && (
            <CreateCandidateModal
              key={`create-${candidate.id}`}
              candidate={candidate}
              opened
              onClose={() => setShowCreateModal(false)}
              onCreated={handleCreated}
              onStale={handleStale}
            />
          )}
          {showDismissModal && (
            <DismissCandidateModal
              key={`dismiss-${candidate.id}`}
              candidate={candidate}
              opened
              onClose={() => setShowDismissModal(false)}
              onDismissSuccess={handleDismissSuccess}
              onStale={handleStale}
            />
          )}
          <PLUGIN_LIBRARY.PublishTablesModal
            isOpened={showPublishModal}
            tableIds={[candidate.table.id]}
            onPublish={handlePublished}
            onClose={() => setShowPublishModal(false)}
          />
        </>
      )}
    </>
  );
}
