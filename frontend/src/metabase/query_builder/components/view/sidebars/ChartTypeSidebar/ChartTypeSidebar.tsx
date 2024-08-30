import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { onCloseChartType } from "metabase/query_builder/actions";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { ChartTypeSettings } from "metabase/query_builder/components/view/chart-type/ChartTypeSettings";
import type Question from "metabase-lib/v1/Question";
import type Query from "metabase-lib/v1/queries/Query";
import type { Dataset } from "metabase-types/api";

export type ChartTypeSidebarProps = {
  question: Question;
  result: Dataset;
  query: Query;
};

export const ChartTypeSidebar = ({
  question,
  result,
  query,
}: ChartTypeSidebarProps) => {
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
