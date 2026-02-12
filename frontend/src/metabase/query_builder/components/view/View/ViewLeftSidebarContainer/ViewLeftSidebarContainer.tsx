import { match } from "ts-pattern";

import { ChartSettingsSidebar } from "metabase/query_builder/components/view/sidebars/ChartSettingsSidebar";
import { ChartTypeSidebar } from "metabase/query_builder/components/view/sidebars/ChartTypeSidebar";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

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
