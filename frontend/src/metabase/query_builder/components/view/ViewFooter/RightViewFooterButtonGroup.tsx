import cx from "classnames";

import CS from "metabase/css/core/index.css";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { Group } from "metabase/ui";
import type { Alert } from "metabase-types/api";

import type { QueryDownloadWidgetProps } from "../../QueryDownloadWidget/QueryDownloadWidget";
import { ExecutionTime } from "../ExecutionTime";
import QuestionAlertWidget from "../QuestionAlertWidget";
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
import {
  QuestionEmbedAction,
  type QuestionEmbedActionProps,
} from "../ViewFooter/QuestionEmbedAction";

export type RightViewFooterButtonGroupProps = QuestionTimelineWidgetProps &
  QuestionTimelineWidgetOpts &
  QueryDownloadWidgetProps &
  QuestionLastUpdatedProps &
  QuestionEmbedActionProps &
  QuestionRowCountOpts &
  QuestionAlertsProps;

// Putting these props here right now since QuestionAlerts will be refactored
type QuestionAlertsProps = {
  canManageSubscriptions: boolean;
  questionAlerts: Alert[];
};

export const RightViewFooterButtonGroup = ({
  result,
  isObjectDetail,
  question,
  visualizationSettings,
  canManageSubscriptions,
  questionAlerts,
  onOpenModal,
  isTimeseries,
  isShowingTimelineSidebar,
  onOpenTimelines,
  onCloseTimelines,
}: RightViewFooterButtonGroupProps) => (
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
      {QuestionAlertWidget.shouldRender({
        question,
        visualizationSettings,
      }) && (
        <QuestionAlertWidget
          className={cx(CS.hide, CS.smShow)}
          canManageSubscriptions={canManageSubscriptions}
          question={question}
          questionAlerts={questionAlerts}
          onCreateAlert={() =>
            question.isSaved()
              ? onOpenModal(MODAL_TYPES.CREATE_ALERT)
              : onOpenModal(MODAL_TYPES.SAVE_QUESTION_BEFORE_ALERT)
          }
        />
      )}
      <QuestionEmbedAction onOpenModal={onOpenModal} question={question} />
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
