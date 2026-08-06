import { t } from "ttag";
import * as Yup from "yup";

import { Form, FormProvider, FormTextarea } from "metabase/forms";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useDismissUsageMetadataCandidateMutation } from "metabase-enterprise/api";
import type { UsageMetadataCandidateDetail } from "metabase-types/api";

import { CANDIDATE_DISMISSAL_REASON_MAX_LENGTH } from "../constants";
import { useCandidateAction } from "../hooks/useCandidateAction";

type DismissCandidateModalProps = {
  candidate: UsageMetadataCandidateDetail;
  opened: boolean;
  onClose: () => void;
  onDismissSuccess: () => void;
  onStale: () => void;
};

type DismissCandidateFormValues = {
  reason: string;
};

const DISMISS_CANDIDATE_SCHEMA = Yup.object({
  reason: Yup.string().max(
    CANDIDATE_DISMISSAL_REASON_MAX_LENGTH,
    Errors.maxLength,
  ),
});

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

  const handleDismiss = async ({ reason }: DismissCandidateFormValues) => {
    await runCandidateAction({
      action: "dismiss",
      candidate,
      request: () =>
        dismissCandidate({
          id: candidate.id,
          reason: reason.trim() || null,
        }).unwrap(),
      errorMessage: t`The candidate could not be dismissed`,
      onStale,
      onSuccess: onDismissSuccess,
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t`Dismiss candidate?`}>
      <FormProvider<DismissCandidateFormValues, unknown>
        initialValues={{ reason: "" }}
        validationSchema={DISMISS_CANDIDATE_SCHEMA}
        onSubmit={handleDismiss}
      >
        <Form>
          <Stack>
            <Text>
              {t`This candidate will stay hidden across future analyses until an administrator restores it.`}
            </Text>
            <FormTextarea
              name="reason"
              label={t`Reason (optional)`}
              autosize
              minRows={3}
              maxLength={CANDIDATE_DISMISSAL_REASON_MAX_LENGTH}
            />
            <Group justify="flex-end">
              <Button type="button" variant="subtle" onClick={onClose}>
                {t`Cancel`}
              </Button>
              <Button type="submit" color="error" loading={isLoading}>
                {t`Dismiss candidate`}
              </Button>
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}
