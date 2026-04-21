import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { QuestionDownloadPopover } from "metabase/query_builder/components/QuestionDownloadPopover";
import {
  getFirstQueryResult,
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { useSelector } from "metabase/utils/redux";

export const ViewFooterDownloadWidget = () => {
  const question = useSelector(getQuestion);
  const result = useSelector(getFirstQueryResult);
  const visualizationSettings = useSelector(getVisualizationSettings);

  return (
    question &&
    result &&
    QuestionDownloadPopover.shouldRender({ result }) && (
      <QuestionDownloadPopover
        className={cx(CS.hide, CS.smShow)}
        question={question}
        result={result}
        visualizationSettings={visualizationSettings}
        dashcardId={question.card().dashcardId}
        dashboardId={question.card().dashboardId}
        variant="viewFooter"
      />
    )
  );
};
