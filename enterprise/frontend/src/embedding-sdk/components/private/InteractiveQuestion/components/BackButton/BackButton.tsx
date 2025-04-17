import {
  DashboardBackButton,
  type DashboardBackButtonProps,
} from "metabase/query_builder/components/view/ViewHeader/components";

import { useInteractiveQuestionContext } from "../../context";

/**
 * @expand
 * @category InteractiveQuestion
 */
export type InteractiveQuestionBackButtonProps = Omit<
  DashboardBackButtonProps,
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
export const BackButton = ({
  ...actionIconProps
}: InteractiveQuestionBackButtonProps) => {
  const { onNavigateBack } = useInteractiveQuestionContext();

  if (!onNavigateBack) {
    return null;
  }

  return (
    <DashboardBackButton noLink onClick={onNavigateBack} {...actionIconProps} />
  );
};
