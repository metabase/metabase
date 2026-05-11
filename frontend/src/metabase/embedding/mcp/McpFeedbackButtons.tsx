import { forwardRef, useEffect, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import type { IconName } from "metabase/ui";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import {
  McpFeedbackModal,
  type McpFeedbackModalValues,
} from "./McpFeedbackModal";
import { submitMcpFeedback } from "./api";

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

interface McpFeedbackButtonsProps {
  instanceUrl: string;
  sessionToken: string;
  mcpSessionId: string;
  prompt: string | null;
  query: string | null;
}

export function McpFeedbackButtons({
  instanceUrl,
  sessionToken,
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendToast] = useToast();

  useEffect(() => {
    setSubmitted(null);
    setModalData(null);
    setIsSubmitting(false);
  }, [prompt, query]);

  const handleFeedback = async (
    values: McpFeedbackModalValues & { positive: boolean },
  ) => {
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
      setIsSubmitting(true);
      await submitMcpFeedback({
        instanceUrl,
        sessionToken,
        mcpSessionId,
        payload,
      });
      sendToast({ icon: "check", message: t`Feedback submitted` });
      setSubmitted(values.positive ? "positive" : "negative");
      setModalData(null);
    } catch {
      sendToast({ icon: "warning", message: t`Failed to submit feedback` });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Tooltip label={t`Give positive feedback`}>
        <FeedbackButton
          data-testid="mcp-feedback-thumbs-up"
          icon="thumbs_up"
          hasBeenClicked={submitted === "positive"}
          disabled={isSubmitting}
          onClick={() => setModalData({ positive: true })}
        />
      </Tooltip>

      <Tooltip label={t`Give negative feedback`}>
        <FeedbackButton
          data-testid="mcp-feedback-thumbs-down"
          icon="thumbs_down"
          hasBeenClicked={submitted === "negative"}
          disabled={isSubmitting}
          onClick={() => setModalData({ positive: false })}
        />
      </Tooltip>

      {modalData && (
        <McpFeedbackModal
          isSubmitting={isSubmitting}
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
