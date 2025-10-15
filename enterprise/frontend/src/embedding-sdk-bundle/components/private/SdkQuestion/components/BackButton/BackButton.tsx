import type { HTMLAttributes } from "react";

import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import { QueryBuilderBackButton } from "metabase/query_builder/components/view/ViewHeader/components";
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
  const { isBreadcrumbEnabled } = useSdkBreadcrumbs();

  if (!onNavigateBack || isBreadcrumbEnabled) {
    return null;
  }

  return (
    <QueryBuilderBackButton
      noLink
      onClick={onNavigateBack}
      parentOverride={backToDashboard}
      {...actionIconProps}
    />
  );
};
