import type { HTMLAttributes, MouseEventHandler } from "react";
import { t } from "ttag";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";
import type { ActionIconProps } from "metabase/ui";

import { useSdkQuestionContext } from "../../context";
import { SdkActionIcon } from "../util/SdkActionIcon";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type RefreshButtonProps = {
  /**
   * Callback function to be called when the button is clicked
   */
  onClick?: MouseEventHandler<HTMLButtonElement>;
} & ActionIconProps &
  HTMLAttributes<HTMLButtonElement>;

/**
 * Button to run the current query. Only appears when automatic reruns are turned off for the database.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const RefreshButton = ({
  onClick,
  ...actionIconProps
}: RefreshButtonProps = {}) => {
  const { question, queryQuestion, isQueryRunning } = useSdkQuestionContext();
  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);

  if (!question || isGuestEmbed || question.canAutoRun()) {
    return null;
  }

  const handleClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    queryQuestion();
    onClick?.(e);
  };

  return (
    <SdkActionIcon
      tooltip={t`Refresh`}
      icon="refresh"
      data-testid="refresh-button"
      disabled={isQueryRunning}
      onClick={handleClick}
      {...actionIconProps}
    />
  );
};
