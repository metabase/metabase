import { forwardRef } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type { McpFeedbackChoice } from "./McpFeedbackArea";

interface FeedbackButtonProps {
  "data-testid": string;
  disabled: boolean;
  icon: IconName;
  onClick: () => void;
  hasBeenClicked: boolean;
}

export interface McpFeedbackButtonsProps {
  isSubmitting: boolean;
  submittedFeedback: McpFeedbackChoice | null;
  onSelectFeedback: (feedback: McpFeedbackChoice) => void;
}

export function McpFeedbackButtons({
  isSubmitting,
  submittedFeedback,
  onSelectFeedback,
}: McpFeedbackButtonsProps) {
  return (
    <>
      <Tooltip label={t`Give positive feedback`}>
        <FeedbackButton
          data-testid="mcp-feedback-thumbs-up"
          icon="thumbs_up"
          hasBeenClicked={submittedFeedback === "positive"}
          disabled={isSubmitting}
          onClick={() => onSelectFeedback("positive")}
        />
      </Tooltip>

      <Tooltip label={t`Give negative feedback`}>
        <FeedbackButton
          data-testid="mcp-feedback-thumbs-down"
          icon="thumbs_down"
          hasBeenClicked={submittedFeedback === "negative"}
          disabled={isSubmitting}
          onClick={() => onSelectFeedback("negative")}
        />
      </Tooltip>
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
          c={hasBeenClicked ? "core-brand" : "currentColor"}
        />
      </ActionIcon>
    );
  },
);
