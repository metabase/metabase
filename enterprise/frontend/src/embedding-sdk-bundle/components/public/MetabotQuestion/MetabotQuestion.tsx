import { useId } from "react";
import { t } from "ttag";

import {
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkAdHocQuestion } from "embedding-sdk-bundle/components/private/SdkAdHocQuestion";
import { SdkQuestionDefaultView } from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useLocale } from "metabase/common/hooks/use-locale";
import { Flex, Paper, Stack, Text } from "metabase/ui";
import { Messages } from "metabase-enterprise/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotResetLongChatButton } from "metabase-enterprise/metabot/components/MetabotChat/MetabotResetLongChatButton";
import {
  useMetabotAgent,
  useMetabotChatHandlers,
} from "metabase-enterprise/metabot/hooks";
import { useMetabotReactions } from "metabase-enterprise/metabot/hooks/use-metabot-reactions";

import { MetabotChatEmbedding } from "./MetabotChatEmbedding";
import { metabotQuestionSchema } from "./MetabotQuestion.schema";
import { QuestionDetails } from "./QuestionDetails";
import { QuestionTitle } from "./QuestionTitle";

const MetabotQuestionInner = () => {
  const { isLocaleLoading } = useLocale();
  const { navigateToPath } = useMetabotReactions();

  if (isLocaleLoading) {
    return <SdkLoader />;
  }

  return (
    <Flex direction="column" align="center" gap="md">
      <MetabotMessages />

      <MetabotChatEmbedding />

      {!!navigateToPath && (
        <SdkAdHocQuestion
          questionPath={navigateToPath}
          title={false}
          isSaveEnabled={false}
        >
          <SdkQuestionDefaultView
            withChartTypeSelector
            title={
              <Stack gap="sm" mb="1rem">
                <QuestionTitle />
                <QuestionDetails />
              </Stack>
            }
          />
        </SdkAdHocQuestion>
      )}

      <Disclaimer />
    </Flex>
  );
};

function MetabotMessages() {
  const metabot = useMetabotAgent();
  const { messages, errorMessages } = metabot;
  const { handleRetryMessage } = useMetabotChatHandlers();
  const { setNavigateToPath } = useMetabotReactions();

  if (!messages.length && !errorMessages.length) {
    return null;
  }

  return (
    <Paper shadow="sm" p="lg" w="100%" maw="41.5rem" radius="lg">
      <Flex direction="column">
        <Messages
          messages={messages}
          errorMessages={errorMessages}
          onRetryMessage={handleRetryMessage}
          isDoingScience={metabot.isDoingScience}
          showFeedbackButtons={false}
          onInternalLinkClick={setNavigateToPath}
        />
      </Flex>

      {metabot.isLongConversation && <MetabotResetLongChatButton />}
    </Paper>
  );
}

function Disclaimer() {
  return (
    <Text c="var(--mb-color-text-secondary)">{t`AI can make mistakes. Double-check results.`}</Text>
  );
}

const MetabotQuestionWrapped = () => {
  const ensureSingleInstanceId = useId();

  return (
    <EnsureSingleInstance
      groupId="metabot-question"
      instanceId={ensureSingleInstanceId}
      multipleRegisteredInstancesWarningMessage={
        "Multiple instances of MetabotQuestion detected. Ensure only one instance of MetabotQuestion is rendered at a time."
      }
    >
      <MetabotQuestionInner />
    </EnsureSingleInstance>
  );
};

export const MetabotQuestion = Object.assign(
  withPublicComponentWrapper(MetabotQuestionWrapped),
  { schema: metabotQuestionSchema },
);
