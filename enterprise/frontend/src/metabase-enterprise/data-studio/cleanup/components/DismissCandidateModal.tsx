import { useState } from "react";
import { t } from "ttag";

import { trackDataStudioCleanupCandidateAction } from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Modal, Stack, Text, Textarea } from "metabase/ui";
import { useDismissUsageMetadataCandidateMutation } from "metabase-enterprise/api";
import type { UsageMetadataCandidateDetail } from "metabase-types/api";

import { getErrorStatus } from "../utils";

type DismissCandidateModalProps = {
  candidate: UsageMetadataCandidateDetail;
  opened: boolean;
  onClose: () => void;
  onDismissed: () => void;
  onStale: () => void;
};

export function DismissCandidateModal({
  candidate,
  opened,
  onClose,
  onDismissed,
  onStale,
}: DismissCandidateModalProps) {
  const [reason, setReason] = useState("");
  const [dismissCandidate, { isLoading }] =
    useDismissUsageMetadataCandidateMutation();
  const { sendErrorToast } = useMetadataToasts();

  const handleDismiss = async () => {
    try {
      await dismissCandidate({
        id: candidate.id,
        reason: reason.trim() || null,
      }).unwrap();
      trackDataStudioCleanupCandidateAction({
        action: "dismiss",
        candidateId: candidate.id,
        candidateType: candidate.candidate_type,
        result: "success",
      });
      onDismissed();
    } catch (error) {
      trackDataStudioCleanupCandidateAction({
        action: "dismiss",
        candidateId: candidate.id,
        candidateType: candidate.candidate_type,
        result: "failure",
      });
      if (getErrorStatus(error) === 409) {
        onStale();
      } else {
        sendErrorToast(t`The candidate could not be dismissed`);
      }
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t`Dismiss candidate?`}>
      <Stack>
        <Text>
          {t`This candidate will stay hidden across future analyses until an administrator restores it.`}
        </Text>
        <Textarea
          label={t`Reason (optional)`}
          value={reason}
          autosize
          minRows={3}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
          <Button color="error" loading={isLoading} onClick={handleDismiss}>
            {t`Dismiss candidate`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
