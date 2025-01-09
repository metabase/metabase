import { ChartSettingsSidebar } from "metabase/query_builder/components/view/sidebars/ChartSettingsSidebar";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

interface ViewLeftSidebarContainerProps {
  question: Question;
  result: Dataset;
  isShowingChartSettingsSidebar: boolean;
}

export const ViewLeftSidebarContainer = ({
  question,
  result,
  isShowingChartSettingsSidebar,
}: ViewLeftSidebarContainerProps) => {
  if (isShowingChartSettingsSidebar) {
    return <ChartSettingsSidebar question={question} result={result} />;
  }

  return null;
};
