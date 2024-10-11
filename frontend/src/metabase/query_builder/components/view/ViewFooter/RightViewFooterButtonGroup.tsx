import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { ViewFooterDownloadWidget } from "metabase/query_builder/components/view/ViewFooter/ViewFooterDownloadWidget";
import {
  getFirstQueryResult,
  getIsObjectDetail,
  getIsTimeseries,
} from "metabase/query_builder/selectors";
import { Group } from "metabase/ui";

import { ExecutionTime } from "../ExecutionTime";
import { QuestionLastUpdated } from "../QuestionLastUpdated/QuestionLastUpdated";
import QuestionRowCount from "../QuestionRowCount";
import QuestionTimelineWidget from "../QuestionTimelineWidget";

export const RightViewFooterButtonGroup = () => {
  const isTimeseries = useSelector(getIsTimeseries);
  const result = useSelector(getFirstQueryResult);
  const isObjectDetail = useSelector(getIsObjectDetail);

  return (
    <Group noWrap>
      {QuestionRowCount.shouldRender({
        result,
        isObjectDetail,
      }) && <QuestionRowCount />}
      {ExecutionTime.shouldRender({ result }) && (
        <ExecutionTime time={result.running_time} />
      )}
      <Group gap="sm" noWrap>
        {QuestionLastUpdated.shouldRender({ result }) && (
          <QuestionLastUpdated
            className={cx(CS.hide, CS.smShow)}
            result={result}
          />
        )}
        <ViewFooterDownloadWidget />
        {QuestionTimelineWidget.shouldRender({ isTimeseries }) && (
          <QuestionTimelineWidget className={cx(CS.hide, CS.smShow)} />
        )}
      </Group>
    </Group>
  );
};
