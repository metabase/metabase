import { ChartSettingsSidebar } from "metabase/query_builder/components/view/sidebars/ChartSettingsSidebar";
import { ChartTypeSidebar } from "metabase/query_builder/components/view/sidebars/ChartTypeSidebar";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

export const ViewLeftSidebarContainer = ({
  question,
  result,
  isShowingChartSettingsSidebar = false,
  isShowingChartTypeSidebar = false,
}: {
  question: Question;
  result: Dataset;
  isShowingChartSettingsSidebar: boolean;
  isShowingChartTypeSidebar: boolean;
}) => {
  if (isShowingChartSettingsSidebar) {
    return <ChartSettingsSidebar question={question} result={result} />;
  }

  // TODO: most likely it's not needed and can be removed
  if (isShowingChartTypeSidebar) {
    return <ChartTypeSidebar question={question} result={result} />;
  }

  return null;
};
