import { match } from "ts-pattern";

import { ChartSettingsSidebar } from "metabase/query_builder/components/view/sidebars/ChartSettingsSidebar";
import { ChartTypeSidebar } from "metabase/query_builder/components/view/sidebars/ChartTypeSidebar";

export const ViewLeftSidebarContainer = ({
  question,
  result,
  isShowingChartSettingsSidebar,
  isShowingChartTypeSidebar,
}) =>
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
