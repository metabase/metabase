import { useCallback } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDispatch } from "metabase/lib/redux";
import type { DataStudioToolbarButtonProps } from "metabase/plugins";
import { openUrl } from "metabase/redux/app";
import { Urls } from "metabase-enterprise/urls";

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
