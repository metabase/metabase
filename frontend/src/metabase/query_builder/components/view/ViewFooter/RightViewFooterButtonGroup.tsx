import cx from "classnames";

import CS from "metabase/css/core/index.css";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
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
import type {
  QuestionTimelineWidgetOpts,
  QuestionTimelineWidgetProps,
} from "../QuestionTimelineWidget/QuestionTimelineWidget";

export type RightViewFooterButtonGroupProps = QuestionTimelineWidgetProps &
  QuestionTimelineWidgetOpts &
  QueryDownloadWidgetProps &
  QuestionLastUpdatedProps &
  QuestionRowCountOpts;

export const RightViewFooterButtonGroup = ({
  result,
  isObjectDetail,
  question,
  visualizationSettings,
  isTimeseries,
  isShowingTimelineSidebar,
  onOpenTimelines,
  onCloseTimelines,
}: RightViewFooterButtonGroupProps) => (
  <>
    {QuestionRowCount.shouldRender({
      result,
      isObjectDetail,
    }) && <QuestionRowCount />}
    {ExecutionTime.shouldRender({ result }) && (
      <ExecutionTime time={result.running_time} />
    )}
    <Group spacing="sm" noWrap>
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
        <QuestionTimelineWidget
          className={cx(CS.hide, CS.smShow)}
          isShowingTimelineSidebar={isShowingTimelineSidebar}
          onOpenTimelines={onOpenTimelines}
          onCloseTimelines={onCloseTimelines}
        />
      )}
    </Group>
  </>
);
