import { t } from "ttag";

import { Form, FormProvider } from "metabase/forms";
import { FormSelect } from "metabase/forms/components/FormSelect";
import { FormTextarea } from "metabase/forms/components/FormTextarea";
import { useSelector } from "metabase/lib/redux";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import { getMetabot, getMetabotId } from "metabase-enterprise/metabot/state";
import type { MetabotFeedback } from "metabase-types/api";

interface MetabotFeedbackModalProps {
  onClose: () => void;
  onSubmit: (feedback: MetabotFeedback) => void;
  messageId?: string;
  positive?: boolean;
  isSubmitting: boolean;
  error: unknown;
}

export const MetabotFeedbackModal = ({
  onClose,
  onSubmit,
  messageId,
  positive = false,
  isSubmitting,
  error: _error, // TODO: render somewhere
}: MetabotFeedbackModalProps) => {
  const metabotId = useSelector(getMetabotId as any) as ReturnType<
    typeof getMetabotId
  >;
  const metabotState = useSelector(getMetabot as any) as ReturnType<
    typeof getMetabot
  >;

  const handleSubmit = (values: Omit<MetabotFeedback, "conversation_data">) =>
    onSubmit({ ...values, conversation_data: metabotState });

  if (!messageId) {
    return undefined;
  }

  return (
    <Modal opened onClose={onClose} size="md" title={t`Metabot feedback`}>
      <FormProvider
        initialValues={{
          metabot_id: metabotId,
          message_id: messageId,
          positive,
          issue_type: positive ? undefined : "",
          freeform_feedback: "",
        }}
        onSubmit={handleSubmit}
      >
        <Form>
          <Stack gap="sm">
            {!positive && (
              <Stack gap="xs">
                <Text>{t`What type of issue do you wish to report? (optional)`}</Text>
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
              <Text>{t`Please provide details: (optional)`}</Text>
              <FormTextarea
                name="freeform_feedback"
                placeholder={t`What could be improved about this response?`}
                minRows={6}
                maxRows={12}
                resize="vertical"
                autosize
              />
            </Stack>

            <Text size="sm">
              {/* eslint-disable-next-line no-literal-metabase-strings -- TODO: do we need to hide feedback because it goes to us in some cases? */}
              {t`Submitting this report will send the entire current conversation to Metabase. Please note that your conversation may contain sensitive data.`}
            </Text>

            <Group justify="flex-end" gap="md" mt="md">
              <Button variant="subtle" onClick={onClose}>
                {t`Cancel`}
              </Button>
              <Button
                variant="filled"
                type="submit"
                disabled={isSubmitting}
                loading={isSubmitting}
              >{t`Submit`}</Button>
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
};
