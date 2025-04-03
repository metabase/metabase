import { useMemo, useState } from "react";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import { MetabotChat } from "metabase-enterprise/metabot/components/MetabotChat";
import { MetabotProvider } from "metabase-enterprise/metabot/context";

export interface MetabotQuestionProps {
  visible: boolean;
  onClose: () => void;
}

export const MetabotQuestion = ({ visible, onClose }: MetabotQuestionProps) => {
  const [result, setResult] = useState<Record<string, any> | null>(null);

  const redirectUrl = useMemo(() => {
    return result?.payload?.payload?.data?.reactions?.find(
      (reaction: { type: string; url: string }) =>
        reaction.type === "metabot.reaction/redirect",
    )?.url;
  }, [result]);

  return (
    <MetabotProvider>
      {redirectUrl && (
        <InteractiveAdHocQuestion
          questionPath={redirectUrl}
          title={false}
          onNavigateBack={() => {}}
        />
      )}

      {visible && (
        <MetabotChat onClose={onClose} onResult={setResult} withMicrophone />
      )}
    </MetabotProvider>
  );
};
