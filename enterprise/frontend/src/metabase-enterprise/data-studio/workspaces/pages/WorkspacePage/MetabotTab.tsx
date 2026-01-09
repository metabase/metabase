import { PLUGIN_METABOT } from "metabase/plugins";
import { useRegisterMetabotTransformContext } from "metabase-enterprise/transforms/hooks/use-register-transform-metabot-context";
import type { DraftTransformSource, Transform } from "metabase-types/api";

type MetabotTabProps = {
  transform?: Transform;
  source?: DraftTransformSource;
  workspaceId?: number;
};

const MetabotContextRegistration = ({
  transform,
  source,
  workspaceId,
}: MetabotTabProps) => {
  useRegisterMetabotTransformContext(transform, source, workspaceId);
  return null;
};

export const MetabotTab = ({
  transform,
  source,
  workspaceId,
}: MetabotTabProps) => {
  const MetabotProvider = PLUGIN_METABOT.getMetabotProvider();
  const MetabotChat = PLUGIN_METABOT.MetabotChat;
  const metabotConfig = {
    // Show top-level mention menu for transforms and databases.
    suggestionModels: ["transform", "database"],
  };

  return (
    <MetabotProvider>
      <MetabotContextRegistration
        transform={transform}
        source={source}
        workspaceId={workspaceId}
      />
      <MetabotChat config={metabotConfig} />
    </MetabotProvider>
  );
};
