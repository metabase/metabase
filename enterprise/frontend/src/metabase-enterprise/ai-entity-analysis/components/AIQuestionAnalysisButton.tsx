import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { PLUGIN_METABOT } from "metabase/plugins";

export const AIQuestionAnalysisButton = () => {
  // Try to use Metabot if available (enterprise), fallback to null (OSS)
  const metabotAgent = PLUGIN_METABOT.useMetabotAgent?.();

  const handleClick = () => {
    if (metabotAgent) {
      // Enterprise: Clear chat, open Metabot and send "Analyze this chart" message
      metabotAgent.resetConversation();
      metabotAgent.setVisible(true);
      metabotAgent.submitInput("Analyze this chart");

      // Focus the chat input after a brief delay (similar to command palette implementation)
      setTimeout(() => {
        document.getElementById("metabot-chat-input")?.focus();
      }, 100);
    }
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
