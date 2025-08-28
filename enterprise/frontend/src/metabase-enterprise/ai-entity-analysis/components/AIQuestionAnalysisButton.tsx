import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export const AIQuestionAnalysisButton = () => {
  const { submitInput, isEnabled } = useMetabotAgent();

  if (!isEnabled) {
    return null;
  }

  const tooltipLabel = t`Explain this chart`;

  return (
    <ToolbarButton
      aria-label={tooltipLabel}
      tooltipLabel={tooltipLabel}
      icon={"metabot"}
      onClick={() => submitInput("Analyze this chart")}
    />
  );
};
