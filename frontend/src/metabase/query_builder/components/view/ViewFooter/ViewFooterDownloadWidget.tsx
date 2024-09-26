import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import {
  getFirstQueryResult,
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";

export const ViewFooterDownloadWidget = () => {
  const question = useSelector(getQuestion);
  const result = useSelector(getFirstQueryResult);
  const visualizationSettings = useSelector(getVisualizationSettings);

  return (
    question &&
    QueryDownloadWidget.shouldRender({ result }) && (
      <QueryDownloadWidget
        className={cx(CS.hide, CS.smShow)}
        question={question}
        result={result}
        visualizationSettings={visualizationSettings}
        dashcardId={question.card().dashcardId}
        dashboardId={question.card().dashboardId}
      />
    )
  );
};
