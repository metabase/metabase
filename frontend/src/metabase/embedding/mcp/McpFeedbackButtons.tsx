import { forwardRef, useState } from "react";
import { t } from "ttag";

import { useSubmitMcpMetabotFeedbackMutation } from "metabase/api/metabot";
import { useToast } from "metabase/common/hooks";
import { Form, FormProvider } from "metabase/forms";
import { FormSelect } from "metabase/forms/components/FormSelect";
import { FormTextarea } from "metabase/forms/components/FormTextarea";
import type { IconName } from "metabase/ui";
import {
  ActionIcon,
  Button,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

interface FeedbackButtonProps {
  disabled: boolean;
  icon: IconName;
  onClick: () => void;
  hasBeenClicked: boolean;
}

const FeedbackButton = forwardRef<HTMLButtonElement, FeedbackButtonProps>(
  function FeedbackButton(
    { disabled, icon, onClick, hasBeenClicked, ...props },
    ref,
  ) {
    return (
      <ActionIcon
        onClick={onClick}
        disabled={disabled}
        h="sm"
        {...props}
        ref={ref}
      >
        <Icon
          name={icon}
          size="1rem"
          c={hasBeenClicked ? "brand" : "currentColor"}
        />
      </ActionIcon>
    );
  },
);

interface McpFeedbackModalProps {
  positive: boolean;
  onClose: () => void;
  onSubmit: (values: {
    issue_type?: string;
    freeform_feedback: string;
  }) => void;
}

function McpFeedbackModal({
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
              <Button variant="subtle" onClick={onClose}>
                {t`Cancel`}
              </Button>
              <Button variant="filled" type="submit">
                {t`Submit`}
              </Button>
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}

interface McpFeedbackButtonsProps {
  mcpSessionId: string;
  prompt: string | null;
  query: string | null;
}

export function McpFeedbackButtons({
  mcpSessionId,
  prompt,
  query,
}: McpFeedbackButtonsProps) {
  const [submitted, setSubmitted] = useState<"positive" | "negative" | null>(
    null,
  );
  const [modalData, setModalData] = useState<{ positive: boolean } | null>(
    null,
  );
  const [submitMcpMetabotFeedback] = useSubmitMcpMetabotFeedbackMutation();
  const [sendToast] = useToast();

  const handleFeedback = async (values: {
    positive: boolean;
    issue_type?: string;
    freeform_feedback: string;
  }) => {
    const payload = {
      feedback: {
        positive: values.positive,
        message_id: crypto.randomUUID(),
        issue_type: values.issue_type || undefined,
        freeform_feedback: values.freeform_feedback || undefined,
      },
      conversation_data: { source: "mcp", prompt, query },
    } as const;

    try {
      await submitMcpMetabotFeedback({ mcpSessionId, payload }).unwrap();
      sendToast({ icon: "check", message: t`Feedback submitted` });
      setSubmitted(values.positive ? "positive" : "negative");
      setModalData(null);
    } catch {
      sendToast({ icon: "warning", message: t`Failed to submit feedback` });
    }
  };

  return (
    <>
      <Tooltip label={t`Give positive feedback`}>
        <FeedbackButton
          data-testid="mcp-feedback-thumbs-up"
          icon="thumbs_up"
          hasBeenClicked={submitted === "positive"}
          disabled={!!submitted}
          onClick={() => setModalData({ positive: true })}
        />
      </Tooltip>
      <Tooltip label={t`Give negative feedback`}>
        <FeedbackButton
          data-testid="mcp-feedback-thumbs-down"
          icon="thumbs_down"
          hasBeenClicked={submitted === "negative"}
          disabled={!!submitted}
          onClick={() => setModalData({ positive: false })}
        />
      </Tooltip>
      {modalData && (
        <McpFeedbackModal
          positive={modalData.positive}
          onClose={() => setModalData(null)}
          onSubmit={(values) =>
            handleFeedback({ positive: modalData.positive, ...values })
          }
        />
      )}
    </>
  );
}
