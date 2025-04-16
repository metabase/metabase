import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { useDispatch } from "metabase/lib/redux";

import { toggleAIQuestionAnalysisSidebar } from "../state";

export const AIQuestionAnalysisButton = () => {
  const dispatch = useDispatch();

  const handleClick = () => {
    dispatch(toggleAIQuestionAnalysisSidebar());
  };

  const tooltipLabel = t`Explain this chart`;

  return (
    <ToolbarButton
      aria-label={tooltipLabel}
      tooltipLabel={tooltipLabel}
      icon={"metabot"}
      onClick={handleClick}
    />
  );
};
