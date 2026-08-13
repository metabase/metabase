import { t } from "ttag";

import { Form, FormProvider } from "metabase/forms";
import { FormSelect } from "metabase/forms/components/FormSelect";
import { FormTextarea } from "metabase/forms/components/FormTextarea";
import { Button, Flex, Stack, Text, UnstyledButton } from "metabase/ui";

export type McpFeedbackChoice = "positive" | "negative";

export interface McpFeedbackAreaValues {
  issue_type?: string;
  freeform_feedback: string;
}

interface McpFeedbackAreaProps {
  feedback: McpFeedbackChoice;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: McpFeedbackAreaValues) => void;
}

export function McpFeedbackArea({
  feedback,
  isSubmitting,
  onCancel,
  onSubmit,
}: McpFeedbackAreaProps) {
  const isPositive = feedback === "positive";

  const feedbackAreaTitle = isPositive
    ? t`Give positive feedback for this result`
    : t`Give negative feedback for this result`;

  return (
    <Flex h="100%" w="100%" direction="column" data-testid="mcp-feedback-area">
      <Flex
        h={65}
        px="lg"
        align="center"
        justify="space-between"
        flex="0 0 auto"
      >
        <Text c="text-primary" fw={700} fz="md">
          {feedbackAreaTitle}
        </Text>

        <UnstyledButton
          c="text-primary"
          fz="md"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          {t`Cancel`}
        </UnstyledButton>
      </Flex>

      <Flex flex={1} w="100%" align="center" justify="center" px="xl" py="lg">
        <FormProvider
          initialValues={{
            issue_type: isPositive ? undefined : "",
            freeform_feedback: "",
          }}
          onSubmit={onSubmit}
        >
          <Form w="100%">
            <Stack w="100%" maw={350} mx="auto" gap="md">
              {!isPositive && (
                <Stack gap="xs">
                  <Text c="text-secondary" fw={700} fz="md">
                    {t`What went wrong?`}
                  </Text>

                  <FormSelect
                    name="issue_type"
                    placeholder={t`Select your problem`}
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

              <FormTextarea
                name="freeform_feedback"
                placeholder={
                  isPositive
                    ? t`Any additional thoughts?`
                    : t`Any additional thoughts?`
                }
                minRows={8}
                resize="vertical"
              />

              <Button
                fullWidth
                variant="filled"
                type="submit"
                loading={isSubmitting}
              >
                {t`Submit`}
              </Button>
            </Stack>
          </Form>
        </FormProvider>
      </Flex>
    </Flex>
  );
}
