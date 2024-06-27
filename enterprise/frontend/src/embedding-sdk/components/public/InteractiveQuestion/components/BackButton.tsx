import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { DashboardBackButton } from "metabase/query_builder/components/view/ViewHeader/components";

export const QuestionBackButton = () => {
  const { onNavigateBack } = useInteractiveQuestionContext();

  return (
    onNavigateBack && <DashboardBackButton noLink onClick={onNavigateBack} />
  );
};
