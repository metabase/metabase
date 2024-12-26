/* eslint-disable react/prop-types */
import { ChartSettingsSidebar } from "metabase/query_builder/components/view/sidebars/ChartSettingsSidebar";
import { ChartTypeSidebar } from "metabase/query_builder/components/view/sidebars/ChartTypeSidebar";

export const ViewLeftSidebarContainer = ({
  question,
  result,
  isShowingChartSettingsSidebar,
  isShowingChartTypeSidebar,
}) => {
  if (isShowingChartSettingsSidebar) {
    return <ChartSettingsSidebar question={question} result={result} />;
  }

  if (isShowingChartTypeSidebar) {
    <ChartTypeSidebar question={question} result={result} />;
  }

  return null;
};
