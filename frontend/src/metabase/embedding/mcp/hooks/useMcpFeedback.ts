import { useEffect, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import type { McpAppsFeedback } from "metabase-types/api";

import type {
  McpFeedbackAreaValues,
  McpFeedbackChoice,
} from "../McpFeedbackArea";
import { submitMcpFeedback } from "../api";

interface UseMcpFeedbackProps {
  instanceUrl: string;

  /** ID for the current MCP session */
  mcpSessionId: string;

  /** User prompt captured from construct_query */
  prompt: string | null;

  /** Ad-hoc query that is being shown, captured from construct_query */
  query: string | null;

  /** Metabase session tokens for authenticating feedback requests */
  sessionToken: string;
}

export function useMcpFeedback({
  instanceUrl,
  mcpSessionId,
  prompt,
  query,
  sessionToken,
}: UseMcpFeedbackProps) {
  const [selectedFeedback, setSelectedFeedback] =
    useState<McpFeedbackChoice | null>(null);

  const [submittedFeedback, setSubmittedFeedback] =
    useState<McpFeedbackChoice | null>(null);

  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const [sendToast] = useToast();

  const feedbackContextRef = useLatest({ prompt, query });

  useEffect(() => {
    setSubmittedFeedback(null);
    setSelectedFeedback(null);
  }, [prompt, query]);

  const handleFeedbackSubmit = async (values: McpFeedbackAreaValues) => {
    if (selectedFeedback == null) {
      return;
    }

    const submittedContext = feedbackContextRef.current;
    const positive = selectedFeedback === "positive";

    const payload: McpAppsFeedback = {
      feedback: {
        positive,
        message_id: crypto.randomUUID(),
        issue_type: values.issue_type || undefined,
        freeform_feedback: values.freeform_feedback || undefined,
      },
      conversation_data: { source: "mcp", ...submittedContext },
    };

    try {
      setIsSubmittingFeedback(true);

      await submitMcpFeedback({
        instanceUrl,
        sessionToken,
        mcpSessionId,
        payload,
      });

      if (
        submittedContext.prompt === feedbackContextRef.current.prompt &&
        submittedContext.query === feedbackContextRef.current.query
      ) {
        sendToast({ icon: "check", message: t`Feedback submitted` });

        setSubmittedFeedback(selectedFeedback);
        setSelectedFeedback(null);
      }
    } catch {
      if (
        submittedContext.prompt === feedbackContextRef.current.prompt &&
        submittedContext.query === feedbackContextRef.current.query
      ) {
        sendToast({ icon: "warning", message: t`Failed to submit feedback` });
      }
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return {
    isSubmittingFeedback,
    selectedFeedback,
    submittedFeedback,
    setSelectedFeedback,
    handleFeedbackSubmit,
  };
}
