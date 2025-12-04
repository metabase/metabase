import { PLUGIN_METABOT } from "metabase/plugins";

export const MetabotTab = () => {
  const MetabotProvider = PLUGIN_METABOT.getMetabotProvider();
  const MetabotChat = PLUGIN_METABOT.MetabotChat;

  return (
    <MetabotProvider>
      <MetabotChat />
    </MetabotProvider>
  );
};
