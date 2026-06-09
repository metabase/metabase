import {
  AIAnalysisSidebar,
  type AIAnalysisSidebarProps,
} from "metabase/metabot/components/AIAnalysisSidebar";
import { getIsLoadingComplete } from "metabase/query_builder/selectors";
import { useSelector } from "metabase/redux";

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
