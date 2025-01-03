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
    // TODO: this sidebar now a part of ChartSettingsSidebar
    // consider removing it
    return <ChartTypeSidebar question={question} result={result} />;
  }

  return null;
};
