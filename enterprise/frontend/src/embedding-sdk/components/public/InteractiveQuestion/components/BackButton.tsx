import { DashboardBackButton } from "metabase/query_builder/components/view/ViewHeader/components";

import { useInteractiveQuestionContext } from "../context";

export const BackButton = () => {
  const { onNavigateBack } = useInteractiveQuestionContext();

  if (!onNavigateBack) {
    return null;
  }

  return <DashboardBackButton noLink onClick={onNavigateBack} />;
};
