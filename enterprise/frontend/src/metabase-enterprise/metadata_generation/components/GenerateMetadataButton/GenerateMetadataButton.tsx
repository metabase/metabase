import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { getUserIsAdmin } from "metabase/current-user";
import type { MetadataGenerationDatabaseButtonProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Button, Icon, Loader } from "metabase/ui";
import { useListMetadataGenerationProposalTablesQuery } from "metabase-enterprise/api";
import type {
  MetadataGenerationRun,
  MetadataGenerationRunId,
} from "metabase-types/api";

import { useDatabaseRun } from "../../hooks";
import { GenerateMetadataModal } from "../GenerateMetadataModal";
import { ReviewModal } from "../ReviewModal";

export function GenerateMetadataButton({
  databaseId,
}: MetadataGenerationDatabaseButtonProps) {
  const isAdmin = useSelector(getUserIsAdmin);

  if (!isAdmin) {
    return null;
  }

  return <GenerateMetadataButtonContent databaseId={databaseId} />;
}

function GenerateMetadataButtonContent({
  databaseId,
}: MetadataGenerationDatabaseButtonProps) {
  const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure();
  const [isReviewOpen, { open: openReview, close: closeReview }] =
    useDisclosure();
  const [startedRunId, setStartedRunId] =
    useState<MetadataGenerationRunId | null>(null);
  // The pending suggestions of every run, not only of the latest one.
  const { data: proposalTables } = useListMetadataGenerationProposalTablesQuery(
    { database_id: databaseId },
  );
  const { latestRun, activeRun } = useDatabaseRun(databaseId);

  const modalRunId = startedRunId ?? activeRun?.id ?? null;
  const hasPending = (proposalTables?.length ?? 0) > 0;
  const state = getButtonState(activeRun, hasPending);

  const handleModalClose = () => {
    setStartedRunId(null);
    closeModal();
  };

  const handleReview = () => {
    setStartedRunId(null);
    closeModal();
    openReview();
  };

  const handleRegenerate = (run: MetadataGenerationRun) => {
    closeReview();
    setStartedRunId(run.id);
    openModal();
  };

  // The server has discarded every suggestion: return to the generate form.
  const handleDiscard = () => {
    closeReview();
    setStartedRunId(null);
    openModal();
  };

  return (
    <>
      <Button
        leftSection={state.icon}
        onClick={state.action === "review" ? openReview : openModal}
        data-testid="generate-metadata-button"
      >
        {state.label}
      </Button>

      <GenerateMetadataModal
        databaseId={databaseId}
        runId={modalRunId}
        onRunStarted={setStartedRunId}
        opened={isModalOpen}
        onClose={handleModalClose}
        onReview={handleReview}
      />
      <ReviewModal
        databaseId={databaseId}
        latestRunId={latestRun?.id}
        opened={isReviewOpen}
        onClose={closeReview}
        onRegenerate={handleRegenerate}
        onDone={closeReview}
        onDiscard={handleDiscard}
      />
    </>
  );
}

type ButtonState = {
  action: "generate" | "review";
  icon: ReactNode;
  label: string;
};

function getButtonState(
  activeRun: MetadataGenerationRun | null,
  hasPending: boolean,
): ButtonState {
  if (activeRun != null) {
    return {
      action: "generate",
      icon: <Loader size="xs" />,
      label: t`Generating field metadata…`,
    };
  }
  if (hasPending) {
    return {
      action: "review",
      icon: <Icon name="sparkles" />,
      label: t`Review suggestions`,
    };
  }
  return {
    action: "generate",
    icon: <Icon name="sparkles" />,
    label: t`Generate field metadata`,
  };
}
