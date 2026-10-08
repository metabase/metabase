import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { Group } from "metabase/ui";

import { getIsObjectDetail } from "../../../store/mode-selectors";
import { getFirstQueryResult, getIsTimeseries } from "../../../store/selectors";
import { ExecutionTime } from "../ExecutionTime";
import { QuestionLastUpdated } from "../QuestionLastUpdated/QuestionLastUpdated";
import { QuestionRowCount } from "../QuestionRowCount";
import { QuestionTimelineWidget } from "../QuestionTimelineWidget";

import S from "./RightViewFooterButtonGroup.module.css";
import { ViewFooterCopyWidget } from "./ViewFooterCopyWidget";
import { ViewFooterDownloadWidget } from "./ViewFooterDownloadWidget";

export const RightViewFooterButtonGroup = () => {
  const isTimeseries = useSelector(getIsTimeseries);
  const result = useSelector(getFirstQueryResult);
  const isObjectDetail = useSelector(getIsObjectDetail);

  return (
    <Group wrap="nowrap" justify="right" className={S.Root}>
      {QuestionRowCount.shouldRender({
        result,
        isObjectDetail,
      }) && <QuestionRowCount />}
      {result && ExecutionTime.shouldRender({ result }) && (
        <ExecutionTime time={result.running_time} />
      )}
      <Group gap="sm" wrap="nowrap">
        {result && QuestionLastUpdated.shouldRender({ result }) && (
          <QuestionLastUpdated
            className={cx(CS.hide, CS.smShow)}
            result={result}
          />
        )}
        {ViewFooterCopyWidget.shouldRender({ result }) && (
          <ViewFooterCopyWidget />
        )}
        <ViewFooterDownloadWidget />
        {QuestionTimelineWidget.shouldRender({ isTimeseries }) && (
          <QuestionTimelineWidget className={cx(CS.hide, CS.smShow)} />
        )}
      </Group>
    </Group>
  );
};
