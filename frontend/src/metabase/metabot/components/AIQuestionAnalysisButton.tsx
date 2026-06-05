import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useToast } from "metabase/common/hooks/use-toast";
import {
  useMetabotAgent,
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";

import { trackExplainChartClicked } from "../analytics";

import { getMetabotNotConfiguredToastProps } from "./AIProviderConfigurationNotice";

export const AIQuestionAnalysisButton = () => {
  const { hasMetabotAccess, canUseMetabot } = useUserMetabotPermissions();
  const { submitInput } = useMetabotAgent("omnibot");
  const metabotName = useMetabotName();
  const [sendToast] = useToast();

  if (!hasMetabotAccess) {
    return null;
  }

  const handleClick = () => {
    if (!canUseMetabot) {
      sendToast(
        getMetabotNotConfiguredToastProps({
          featureName: metabotName,
        }),
      );
      return;
    }

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
