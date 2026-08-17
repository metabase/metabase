import {
  AIAnalysisSidebar,
  type AIAnalysisSidebarProps,
} from "metabase/metabot/components/AIAnalysisSidebar";
import { useSelector } from "metabase/redux";

import { getIsLoadingComplete } from "../../store/selectors";

export type AIQuestionAnalysisSidebarProps = Omit<
  AIAnalysisSidebarProps,
  "isLoadingComplete"
>;

export function AIQuestionAnalysisSidebar(
  props: AIQuestionAnalysisSidebarProps,
) {
  const isLoadingComplete = useSelector(getIsLoadingComplete);
  return <AIAnalysisSidebar {...props} isLoadingComplete={isLoadingComplete} />;
}
