import { t } from "ttag";

import { Form, FormProvider } from "metabase/forms";
import { FormSelect } from "metabase/forms/components/FormSelect";
import { FormTextarea } from "metabase/forms/components/FormTextarea";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";

export interface McpFeedbackModalValues {
  issue_type?: string;
  freeform_feedback: string;
}

interface McpFeedbackModalProps {
  isSubmitting: boolean;
  positive: boolean;
  onClose: () => void;
  onSubmit: (values: McpFeedbackModalValues) => void;
}

export function McpFeedbackModal({
  isSubmitting,
  positive,
  onClose,
  onSubmit,
}: McpFeedbackModalProps) {
  return (
    <Modal
      opened
      onClose={onClose}
      size="md"
      title={t`Visualization feedback`}
      data-testid="mcp-feedback-modal"
    >
      <FormProvider
        initialValues={{
          issue_type: positive ? undefined : "",
          freeform_feedback: "",
        }}
        onSubmit={onSubmit}
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
                    { label: t`Incorrect data`, value: "incorrect-data" },
                    {
                      label: t`Wrong visualization`,
                      value: "wrong-visualization",
                    },
                    {
                      label: t`Did not follow request`,
                      value: "did-not-follow-request",
                    },
                    { label: t`Other`, value: "other" },
                  ]}
                />
              </Stack>
            )}

            <Stack gap="xs">
              <Text>
                {positive
                  ? t`Any details that you'd like to share? (optional)`
                  : t`What could be improved? (optional)`}
              </Text>

              <FormTextarea
                name="freeform_feedback"
                placeholder={
                  positive
                    ? t`Tell us what you liked!`
                    : t`What could be improved about this result?`
                }
                minRows={4}
                maxRows={10}
                resize="vertical"
                autosize
              />
            </Stack>

            <Group justify="flex-end" gap="md" mt="md">
              <Button
                variant="subtle"
                disabled={isSubmitting}
                onClick={onClose}
              >
                {t`Cancel`}
              </Button>

              <Button variant="filled" type="submit" loading={isSubmitting}>
                {t`Submit`}
              </Button>
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}
