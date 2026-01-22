import { useCallback } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { openUrl } from "metabase/redux/app";
import type Question from "metabase-lib/v1/Question";

type DataStudioToolbarButtonProps = {
  question: Question;
};
export const DataStudioToolbarButton = ({
  question,
}: DataStudioToolbarButtonProps) => {
  const dispatch = useDispatch();
  const isMetric = question.type() === "metric";

  const handleClick = useCallback(() => {
    dispatch(openUrl(Urls.dataStudioMetric(question.id())));
  }, [question, dispatch]);

  if (!isMetric) {
    return null;
  }

  return (
    <ToolbarButton
      onClick={handleClick}
      icon="data_studio"
      aria-label={t`Open in Data Studio`}
      tooltipLabel={t`Open in Data Studio`}
    />
  );
};
