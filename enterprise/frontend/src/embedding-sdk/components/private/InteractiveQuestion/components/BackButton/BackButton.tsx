import {
  DashboardBackButton,
  type DashboardBackButtonProps,
} from "metabase/query_builder/components/view/ViewHeader/components";

import { useInteractiveQuestionContext } from "../../context";

/**
 * @category InteractiveQuestion
 * @remarks
 * Uses [Mantine ActionIcon props](https://v7.mantine.dev/core/action-icon/) under the hood
 */
export type InteractiveQuestionBackButtonProps = Omit<
  DashboardBackButtonProps,
  "noLink" | "onClick"
>;

export const BackButton = (
  actionIconProps: InteractiveQuestionBackButtonProps,
) => {
  const { onNavigateBack } = useInteractiveQuestionContext();

  if (!onNavigateBack) {
    return null;
  }

  return (
    <DashboardBackButton noLink onClick={onNavigateBack} {...actionIconProps} />
  );
};
