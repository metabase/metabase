import { useState } from "react";
import { t } from "ttag";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { Flex, Text } from "metabase/ui";

import { MetabotChatEmbedding } from "./MetabotChatEmbedding";

const MetabotQuestionInner = () => {
  const [redirectUrl, setRedirectUrl] = useState<string>("");

  return (
    <Flex direction="column" align="center" gap="3rem">
      <MetabotChatEmbedding onRedirectUrl={setRedirectUrl} />
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
  );
};

function Disclaimer() {
  return (
    <Text c="var(--mb-color-text-secondary)">{t`AI can make mistakes. Double check results.`}</Text>
  );
}
export const MetabotQuestion = withPublicComponentWrapper(MetabotQuestionInner);
