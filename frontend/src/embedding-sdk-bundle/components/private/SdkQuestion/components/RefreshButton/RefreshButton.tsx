import type { MouseEvent } from "react";
import { t } from "ttag";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";
import type { ButtonProps } from "embedding-sdk-bundle/types/ui";
import { transformSdkQuestion } from "metabase/embedding-sdk/lib/transform-question";
import { Button, Icon, Tooltip } from "metabase/ui";

import { useSdkQuestionContext } from "../../context";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type RefreshButtonProps = ButtonProps;

/**
 * Button to run the current query. Only appears when automatic reruns are turned off for the database.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const RefreshButton = ({
  onClick,
  ...buttonProps
}: RefreshButtonProps = {}) => {
  const { question, queryQuestion, isQueryRunning, onRun } =
    useSdkQuestionContext();
  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);

  if (!question || isGuestEmbed || question.canAutoRun()) {
    return null;
  }

  const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    const nextQuestion = await queryQuestion();
    onRun?.(nextQuestion && transformSdkQuestion(nextQuestion));
  };

  return (
    <Tooltip label={t`Refresh`}>
      <Button
        leftSection={<Icon name="refresh" />}
        aria-label={t`Refresh`}
        data-testid="refresh-button"
        disabled={isQueryRunning}
        onClick={handleClick}
        {...buttonProps}
      />
    </Tooltip>
  );
};
