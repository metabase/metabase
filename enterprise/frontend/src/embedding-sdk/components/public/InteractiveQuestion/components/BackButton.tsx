import { DashboardBackButton } from "metabase/query_builder/components/view/ViewHeader/components";

import { useInteractiveQuestionContext } from "../context";

export const BackButton = () => {
  const { onNavigateBack } = useInteractiveQuestionContext();

  return (
    onNavigateBack && <DashboardBackButton noLink onClick={onNavigateBack} />
  );
};
