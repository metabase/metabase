import { PLUGIN_METABOT } from "metabase/plugins";
import { MetabotChat } from "metabase-enterprise/metabot/components/MetabotChat";
import { MetabotProvider } from "metabase-enterprise/metabot/context";

import "metabase-enterprise/metabot";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const MetabotQuestion = ({ visible, onClose }: Props) => {
  return (
    <MetabotProvider>
      {visible && <MetabotChat onClose={onClose} />}
    </MetabotProvider>
  );
};
