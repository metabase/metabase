import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useEffect, useState } from "react";
import { t } from "ttag";

import { getUserIsAdmin } from "metabase/current-user";
import type { MetadataGenerationDatabaseButtonProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Button, Icon, Loader } from "metabase/ui";
import { useListMetadataGenerationRunsQuery } from "metabase-enterprise/api";
import type {
  MetadataGenerationRun,
  MetadataGenerationRunId,
} from "metabase-types/api";

import { RUN_POLLING_INTERVAL, canReviewRun, isRunActive } from "../../utils";
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
  const [hasActiveRun, setHasActiveRun] = useState(false);
  // The run the person dismissed from an empty review, so the button offers to generate again.
  const [dismissedRunId, setDismissedRunId] =
    useState<MetadataGenerationRunId | null>(null);
  const { data: runs } = useListMetadataGenerationRunsQuery(
    { database_id: databaseId },
    // The list keeps polling while the run continues in the background, so the
    // button changes to "Review suggestions" once the run is done.
    { pollingInterval: hasActiveRun ? RUN_POLLING_INTERVAL : 0 },
  );
  const latestRun = runs?.[0] ?? null;
  const activeRun =
    latestRun != null && isRunActive(latestRun) ? latestRun : null;
  const isActive = activeRun != null;

  useEffect(() => {
    setHasActiveRun(isActive);
  }, [isActive]);

  const modalRunId = startedRunId ?? activeRun?.id ?? null;
  const state = getButtonState(
    activeRun,
    latestRun != null && latestRun.id !== dismissedRunId ? latestRun : null,
  );

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

  const handleReviewDone = () => {
    setDismissedRunId(latestRun?.id ?? null);
    closeReview();
  };

  // Discarding sets the run aside and returns to the generate form.
  const handleDiscard = () => {
    setDismissedRunId(latestRun?.id ?? null);
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
      {latestRun != null && (
        <ReviewModal
          runId={latestRun.id}
          opened={isReviewOpen}
          onClose={closeReview}
          onRegenerate={handleRegenerate}
          onDone={handleReviewDone}
          onDiscard={handleDiscard}
        />
      )}
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
  latestRun: MetadataGenerationRun | null,
): ButtonState {
  if (activeRun != null) {
    return {
      action: "generate",
      icon: <Loader size="xs" />,
      label: t`Generating metadata…`,
    };
  }
  if (latestRun != null && canReviewRun(latestRun)) {
    return {
      action: "review",
      icon: <Icon name="sparkles" />,
      label: t`Review suggestions`,
    };
  }
  return {
    action: "generate",
    icon: <Icon name="sparkles" />,
    label: t`Generate metadata`,
  };
}
