import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useMetabotEnabledEmbeddingAware } from "metabase/metabot/hooks";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { trackExplainChartClicked } from "../analytics";

export const AIQuestionAnalysisButton = () => {
  const isMetabotEnabled = useMetabotEnabledEmbeddingAware();
  const { submitInput } = useMetabotAgent("omnibot");

  if (!isMetabotEnabled) {
    return null;
  }

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
