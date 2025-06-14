import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export const AIQuestionAnalysisButton = () => {
  const { startNewConversation } = useMetabotAgent();

  const handleClick = () => startNewConversation("Analyze this chart");

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
