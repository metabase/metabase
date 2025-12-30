import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { trackExplainChartClicked } from "../analytics";

export const AIQuestionAnalysisButton = () => {
  const { submitInput } = useMetabotAgent("omnibot");

  const handleClick = () => {
    trackExplainChartClicked();
    submitInput("Analyze this chart");
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
