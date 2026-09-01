import { match } from "ts-pattern";

import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

import { ChartSettingsSidebar } from "../../sidebars/ChartSettingsSidebar";
import { ChartTypeSidebar } from "../../sidebars/ChartTypeSidebar";

interface ViewLeftSidebarContainerProps {
  question: Question;
  result: Dataset;
  isShowingChartSettingsSidebar: boolean;
  isShowingChartTypeSidebar: boolean;
}

export const ViewLeftSidebarContainer = ({
  question,
  result,
  isShowingChartSettingsSidebar,
  isShowingChartTypeSidebar,
}: ViewLeftSidebarContainerProps) =>
  match({
    isShowingChartSettingsSidebar,
    isShowingChartTypeSidebar,
  })
    .with(
      {
        isShowingChartSettingsSidebar: true,
      },
      () => <ChartSettingsSidebar question={question} result={result} />,
    )
    .with(
      {
        isShowingChartTypeSidebar: true,
      },
      () => <ChartTypeSidebar question={question} result={result} />,
    )
    .otherwise(() => null);
