import { useEffect } from "react";

import { METABOT_SDK_EE_PLUGIN } from "embedding-sdk-bundle/components/public/MetabotQuestion/MetabotQuestion";
import { useMetabot } from "embedding-sdk-bundle/hooks/public/use-metabot";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { publishMetabotState } from "embedding-sdk-shared/lib/metabot-state-channel";
import { MetabaseReduxProvider } from "metabase/redux";

type Props = {
  store: SdkStore;
};

const MetabotStatePublisher = () => {
  const metabot = useMetabot();
  useEffect(() => {
    publishMetabotState(metabot);
    return () => publishMetabotState(null);
  }, [metabot]);
  return null;
};

export const MetabotSubscriber = ({ store }: Props) => (
  <MetabaseReduxProvider store={store}>
    <METABOT_SDK_EE_PLUGIN.MetabotProvider>
      <MetabotStatePublisher />
    </METABOT_SDK_EE_PLUGIN.MetabotProvider>
  </MetabaseReduxProvider>
);
