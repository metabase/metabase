import { useMemo, useState } from "react";
import { t } from "ttag";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import { Flex, Text } from "metabase/ui";
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
        <Disclaimer />
      </Flex>
    </MetabotProvider>
  );
};

function Disclaimer() {
  return (
    <Text c="var(--mb-color-text-secondary)">{t`AI can make mistakes. Double check results.`}</Text>
  );
}
