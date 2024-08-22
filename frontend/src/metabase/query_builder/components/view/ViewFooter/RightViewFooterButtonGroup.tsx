import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import { getIsTimeseries } from "metabase/query_builder/selectors";
import { Group } from "metabase/ui";

import type { QueryDownloadWidgetProps } from "../../QueryDownloadWidget/QueryDownloadWidget";
import { ExecutionTime } from "../ExecutionTime";
import {
  QuestionLastUpdated,
  type QuestionLastUpdatedProps,
} from "../QuestionLastUpdated/QuestionLastUpdated";
import QuestionRowCount from "../QuestionRowCount";
import type { QuestionRowCountOpts } from "../QuestionRowCount/QuestionRowCount";
import QuestionTimelineWidget from "../QuestionTimelineWidget";
import type { QuestionTimelineWidgetProps } from "../QuestionTimelineWidget/QuestionTimelineWidget";

export type RightViewFooterButtonGroupProps = QuestionTimelineWidgetProps &
  QueryDownloadWidgetProps &
  QuestionLastUpdatedProps &
  QuestionRowCountOpts;

export const RightViewFooterButtonGroup = ({
  result,
  isObjectDetail,
  question,
  visualizationSettings,
}: RightViewFooterButtonGroupProps) => {
  const isTimeseries = useSelector(getIsTimeseries);

  return (
    <>
      {QuestionRowCount.shouldRender({
        result,
        isObjectDetail,
      }) && <QuestionRowCount key="row_count" />}
      {ExecutionTime.shouldRender({ result }) && (
        <ExecutionTime key="execution_time" time={result.running_time} />
      )}
      <Group key="button-group" spacing="sm" noWrap>
        {QuestionLastUpdated.shouldRender({ result }) && (
          <QuestionLastUpdated
            className={cx(CS.hide, CS.smShow)}
            result={result}
          />
        )}
        {QueryDownloadWidget.shouldRender({ result }) && (
          <QueryDownloadWidget
            className={cx(CS.hide, CS.smShow)}
            question={question}
            result={result}
            visualizationSettings={visualizationSettings}
            dashcardId={question.card().dashcardId}
            dashboardId={question.card().dashboardId}
          />
        )}
        {QuestionTimelineWidget.shouldRender({ isTimeseries }) && (
          <QuestionTimelineWidget className={cx(CS.hide, CS.smShow)} />
        )}
      </Group>
    </>
  );
};
