import {
  DashboardBackButton,
  type DashboardBackButtonProps,
} from "metabase/query_builder/components/view/ViewHeader/components";

import { useInteractiveQuestionContext } from "../../context";

export const BackButton = (
  actionIconProps: Omit<DashboardBackButtonProps, "noLink" | "onClick">,
) => {
  const { onNavigateBack } = useInteractiveQuestionContext();

  if (!onNavigateBack) {
    return null;
  }

  return (
    <DashboardBackButton noLink onClick={onNavigateBack} {...actionIconProps} />
  );
};
