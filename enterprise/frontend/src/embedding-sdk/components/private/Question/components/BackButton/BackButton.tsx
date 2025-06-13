import type { HTMLAttributes } from "react";

import { DashboardBackButton } from "metabase/query_builder/components/view/ViewHeader/components";
import type { ActionIconProps } from "metabase/ui";

import { useQuestionContext } from "../../context";

/**
 * @expand
 * @category Question
 */
export type QuestionBackButtonProps = Omit<
  ActionIconProps & HTMLAttributes<HTMLButtonElement>,
  "noLink" | "onClick"
>;

/**
 * A navigation button that returns to the previous view.
 * Only visible when rendered within the {@link InteractiveDashboardProps.renderDrillThroughQuestion} prop.
 *
 * @function
 * @category Question
 * @param props
 */
export const BackButton = ({ ...actionIconProps }: QuestionBackButtonProps) => {
  const { onNavigateBack } = useQuestionContext();

  if (!onNavigateBack) {
    return null;
  }

  return (
    <DashboardBackButton noLink onClick={onNavigateBack} {...actionIconProps} />
  );
};
