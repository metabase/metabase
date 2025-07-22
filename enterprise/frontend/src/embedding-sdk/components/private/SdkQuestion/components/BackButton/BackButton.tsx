import type { HTMLAttributes } from "react";

import { DashboardBackButton } from "metabase/query_builder/components/view/ViewHeader/components";
import type { ActionIconProps } from "metabase/ui";

import { useSdkQuestionContext } from "../../context";

/**
 * @expand
 * @category InteractiveQuestion
 */
export type BackButtonProps = Omit<
  ActionIconProps & HTMLAttributes<HTMLButtonElement>,
  "noLink" | "onClick"
>;

/**
 * A navigation button that returns to the previous view.
 * Only visible when rendered within the {@link InteractiveDashboardProps.renderDrillThroughQuestion} prop.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const BackButton = ({ ...actionIconProps }: BackButtonProps) => {
  const { onNavigateBack, backToDashboard } = useSdkQuestionContext();

  if (!onNavigateBack) {
    return null;
  }

  return (
    <DashboardBackButton
      noLink
      onClick={onNavigateBack}
      dashboardOverride={backToDashboard}
      {...actionIconProps}
    />
  );
};
