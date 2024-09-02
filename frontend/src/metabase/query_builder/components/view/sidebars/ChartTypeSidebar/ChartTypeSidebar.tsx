import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { onCloseChartType } from "metabase/query_builder/actions";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import {
  ChartTypeSettings,
  type ChartTypeSettingsProps,
} from "metabase/query_builder/components/view/chart-type/ChartTypeSettings";

export const ChartTypeSidebar = ({
  question,
  result,
  query,
}: ChartTypeSettingsProps) => {
  const dispatch = useDispatch();

  return (
    <SidebarContent
      className={cx(CS.fullHeight, CS.px1)}
      onDone={() => dispatch(onCloseChartType())}
      data-testid="chart-type-sidebar"
    >
      <ChartTypeSettings question={question} result={result} query={query} />
    </SidebarContent>
  );
};
