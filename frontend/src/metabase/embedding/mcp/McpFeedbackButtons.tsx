import { forwardRef, useEffect, useRef, useState } from "react";
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
  "data-testid": string;
  disabled: boolean;
  icon: IconName;
  onClick: () => void;
  hasBeenClicked: boolean;
}

interface McpFeedbackButtonsProps {
  instanceUrl: string;
  sessionToken: string;
  mcpSessionId: string;
  prompt: string | null;
  query: string | null;
}

type FeedbackChoice = "positive" | "negative";
type FeedbackContext = Pick<McpFeedbackButtonsProps, "prompt" | "query">;

const isSameFeedbackContext = (
  first: FeedbackContext,
  second: FeedbackContext,
) => first.prompt === second.prompt && first.query === second.query;

export function McpFeedbackButtons({
  instanceUrl,
  sessionToken,
  mcpSessionId,
  prompt,
  query,
}: McpFeedbackButtonsProps) {
  const [selectedFeedback, setSelectedFeedback] =
    useState<FeedbackChoice | null>(null);

  // Used for icon highlighting based on last submitted feedback
  const [submittedFeedback, setSubmittedFeedback] =
    useState<FeedbackChoice | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sendToast] = useToast();
  const feedbackContext = { prompt, query };

  const feedbackContextRef = useRef<FeedbackContext>(feedbackContext);
  feedbackContextRef.current = feedbackContext;

  useEffect(() => {
    setSubmittedFeedback(null);
    setSelectedFeedback(null);
  }, [prompt, query]);

  const handleFeedback = async (
    values: McpFeedbackModalValues & { positive: boolean },
  ) => {
    const submittedContext = feedbackContextRef.current;
    const payload = {
      feedback: {
        positive: values.positive,
        message_id: crypto.randomUUID(),
        issue_type: values.issue_type || undefined,
        freeform_feedback: values.freeform_feedback || undefined,
      },
      conversation_data: { source: "mcp", ...submittedContext },
    } as const;

    try {
      setIsSubmitting(true);

      await submitMcpFeedback({
        instanceUrl,
        sessionToken,
        mcpSessionId,
        payload,
      });

      if (isSameFeedbackContext(submittedContext, feedbackContextRef.current)) {
        sendToast({ icon: "check", message: t`Feedback submitted` });
        setSubmittedFeedback(values.positive ? "positive" : "negative");
        setSelectedFeedback(null);
      }
    } catch {
      if (isSameFeedbackContext(submittedContext, feedbackContextRef.current)) {
        sendToast({ icon: "warning", message: t`Failed to submit feedback` });
      }
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
          hasBeenClicked={submittedFeedback === "positive"}
          disabled={isSubmitting}
          onClick={() => setSelectedFeedback("positive")}
        />
      </Tooltip>

      <Tooltip label={t`Give negative feedback`}>
        <FeedbackButton
          data-testid="mcp-feedback-thumbs-down"
          icon="thumbs_down"
          hasBeenClicked={submittedFeedback === "negative"}
          disabled={isSubmitting}
          onClick={() => setSelectedFeedback("negative")}
        />
      </Tooltip>

      {selectedFeedback != null && (
        <McpFeedbackModal
          isSubmitting={isSubmitting}
          positive={selectedFeedback === "positive"}
          onClose={() => setSelectedFeedback(null)}
          onSubmit={(values) =>
            handleFeedback({
              positive: selectedFeedback === "positive",
              ...values,
            })
          }
        />
      )}
    </>
  );
}

const FeedbackButton = forwardRef<HTMLButtonElement, FeedbackButtonProps>(
  function FeedbackButton(
    { "data-testid": dataTestId, disabled, icon, onClick, hasBeenClicked },
    ref,
  ) {
    return (
      <ActionIcon
        data-testid={dataTestId}
        onClick={onClick}
        disabled={disabled}
        h="sm"
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
