import { useMemo, useState } from "react";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import { Flex } from "metabase/ui";
import { MetabotProvider } from "metabase-enterprise/metabot/context";

import { MetabotChatEmbedding } from "./MetabotChatEmbedding";

export const MetabotQuestion = () => {
  const [result, setResult] = useState<Record<string, any> | null>(null);

  const redirectUrl = useMemo(() => {
    return result?.payload?.payload?.data?.reactions?.find(
      (reaction: { type: string; url: string }) =>
        reaction.type === "metabot.reaction/redirect",
    )?.url;
  }, [result]);

  return (
    <MetabotProvider>
      <Flex direction="column" align="center" gap="3rem">
        <MetabotChatEmbedding onResult={setResult} />
        {redirectUrl && (
          <InteractiveAdHocQuestion
            questionPath={redirectUrl}
            title={false}
            onNavigateBack={() => {}}
            isSaveEnabled={false}
          />
        )}
      </Flex>
    </MetabotProvider>
  );
};
