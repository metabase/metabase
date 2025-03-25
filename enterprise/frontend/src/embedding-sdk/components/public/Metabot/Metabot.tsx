import { MetabotChat } from "metabase-enterprise/metabot/components/MetabotChat";
import { MetabotProvider } from "metabase-enterprise/metabot/context";

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
