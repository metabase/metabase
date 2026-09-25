import { t } from "ttag";

import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import { useDismissUsageMetadataCandidateMutation } from "metabase-enterprise/api";
import type { UsageMetadataCandidateDetail } from "metabase-types/api";

import { useCandidateAction } from "../hooks/useCandidateAction";

type DismissCandidateModalProps = {
  candidate: UsageMetadataCandidateDetail;
  opened: boolean;
  onClose: () => void;
  onDismissSuccess: () => void;
  onStale: () => void;
};

export function DismissCandidateModal({
  candidate,
  opened,
  onClose,
  onDismissSuccess,
  onStale,
}: DismissCandidateModalProps) {
  const [dismissCandidate, { isLoading }] =
    useDismissUsageMetadataCandidateMutation();
  const runCandidateAction = useCandidateAction();

  const handleDismiss = async () => {
    await runCandidateAction({
      action: "dismiss",
      candidate,
      request: () => dismissCandidate(candidate.id).unwrap(),
      errorMessage: t`The candidate could not be dismissed`,
      onStale,
      onSuccess: onDismissSuccess,
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t`Dismiss candidate?`}>
      <Stack>
        <Text>
          {t`This candidate will stay hidden across future analyses until an administrator restores it.`}
        </Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button color="error" loading={isLoading} onClick={handleDismiss}>
            {t`Dismiss candidate`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
