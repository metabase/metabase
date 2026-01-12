import { c, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Form, FormProvider } from "metabase/forms";
import { FormSelect } from "metabase/forms/components/FormSelect";
import { FormTextarea } from "metabase/forms/components/FormTextarea";
import { useSelector } from "metabase/lib/redux";
import { getMetabotId, getMetabotState } from "metabase/metabot/state";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import type { MetabotFeedback } from "metabase-types/api";

interface MetabotFeedbackModalProps {
  onClose: () => void;
  onSubmit: (feedback: MetabotFeedback) => void;
  messageId: string;
  positive: boolean;
}

export const MetabotFeedbackModal = ({
  onClose,
  onSubmit,
  messageId,
  positive,
}: MetabotFeedbackModalProps) => {
  const applicationName = useSelector(getApplicationName);
  const isAdmin = useSelector(getUserIsAdmin);
  const version = useSetting("version");

  const metabotId = useSelector(getMetabotId);
  const metabotState = useSelector(getMetabotState);

  const handleSubmit = (
    values: Pick<
      MetabotFeedback["feedback"],
      "issue_type" | "freeform_feedback"
    >,
  ) =>
    onSubmit({
      version,
      metabot_id: metabotId,
      feedback: {
        message_id: messageId,
        positive,
        ...values,
      },
      conversation_data: metabotState,
      is_admin: isAdmin,
      submission_time: new Date().toISOString(),
    });

  return (
    <Modal
      opened
      onClose={onClose}
      size="md"
      title={t`Metabot feedback`}
      data-testid="metabot-feedback-modal"
    >
      <FormProvider
        initialValues={{
          issue_type: positive ? undefined : "",
          freeform_feedback: "",
        }}
        onSubmit={handleSubmit}
      >
        <Form>
          <Stack gap="md">
            {!positive && (
              <Stack gap="xs">
                <Text>{t`What kind of issue are you reporting? (optional)`}</Text>
                <FormSelect
                  name="issue_type"
                  placeholder={t`Select issue type`}
                  data={[
                    { label: t`UI bug`, value: "ui-bug" },
                    {
                      label: t`Took incorrect actions`,
                      value: "took-incorrect-actions",
                    },
                    { label: t`Overall refusal`, value: "overall-refusal" },
                    {
                      label: t`Did not follow request`,
                      value: "did-not-follow-request",
                    },
                    { label: t`Not factually correct`, value: "not-factual" },
                    {
                      label: t`Incomplete response`,
                      value: "incomplete-response",
                    },
                    { label: t`Other`, value: "other" },
                  ]}
                />
              </Stack>
            )}
            <Stack gap="xs">
              <Text>{t`Any details that you'd like to share? (optional)`}</Text>
              <FormTextarea
                name="freeform_feedback"
                placeholder={
                  positive
                    ? t`Tell us what you liked!`
                    : t`What could be improved about this response?`
                }
                minRows={6}
                maxRows={12}
                resize="vertical"
                autosize
              />
            </Stack>

            <Text size="sm" color="text-secondary">
              {/* eslint-disable-next-line no-literal-metabase-strings -- this is a translation context string, not shown to users */}
              {c("{0} is the name of the application, usually 'Metabase'")
                .t`Please submit this report to ${applicationName}. Note that it may contain sensitive data from your conversation.`}
            </Text>

            <Group justify="flex-end" gap="md" mt="md">
              <Button variant="subtle" onClick={onClose}>
                {t`Cancel`}
              </Button>
              <Button variant="filled" type="submit">{c(
                "This is a verb, not a noun",
              ).t`Submit`}</Button>
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
};
