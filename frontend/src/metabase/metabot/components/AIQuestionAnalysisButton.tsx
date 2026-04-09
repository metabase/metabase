import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";

import { trackExplainChartClicked } from "../analytics";

export const AIQuestionAnalysisButton = () => {
  const { canUseMetabot } = useUserMetabotPermissions();
  const { submitInput } = useMetabotAgent("omnibot");

  if (!canUseMetabot) {
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
