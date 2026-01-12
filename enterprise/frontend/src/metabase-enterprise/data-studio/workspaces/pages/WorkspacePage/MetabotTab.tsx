import { PLUGIN_METABOT } from "metabase/plugins";
import { useRegisterMetabotTransformContext } from "metabase-enterprise/transforms/hooks/use-register-transform-metabot-context";
import type { DraftTransformSource, Transform } from "metabase-types/api";

type MetabotTabProps = {
  transform?: Transform;
  source?: DraftTransformSource;
  workspaceId?: number;
};

const MetabotContextRegistration = ({ transform, source }: MetabotTabProps) => {
  useRegisterMetabotTransformContext(transform, source);
  return null;
};

export const MetabotTab = ({ transform, source }: MetabotTabProps) => {
  const MetabotProvider = PLUGIN_METABOT.getMetabotProvider();
  const MetabotChat = PLUGIN_METABOT.MetabotChat;

  return (
    <MetabotProvider>
      <MetabotContextRegistration transform={transform} source={source} />
      <MetabotChat
        config={{
          // Show top-level mention menu for transforms and databases.
          suggestionModels: ["transform", "database"],
        }}
      />
    </MetabotProvider>
  );
};
