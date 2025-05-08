import { useState } from "react";
import { t } from "ttag";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import { InteractiveQuestionDefaultView } from "embedding-sdk/components/private/InteractiveQuestionDefaultView";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { Flex, Icon, Paper, Stack, Text } from "metabase/ui";
import { getErrorMessage } from "metabase-enterprise/metabot/constants";

import { MetabotChatEmbedding } from "./MetabotChatEmbedding";
import { QuestionDetails } from "./QuestionDetails";
import { QuestionTitle } from "./QuestionTitle";

const MetabotQuestionInner = () => {
  const [redirectUrl, setRedirectUrl] = useState<string>("");
  const [messages, setMessages] = useState<string[]>([]);

  return (
    <Flex direction="column" align="center" gap="md">
      <MetabotChatEmbedding
        onRedirectUrl={setRedirectUrl}
        onMessages={setMessages}
      />
      {messages.map((message, index) => (
        <Message key={index} message={message} />
      ))}
      {redirectUrl && (
        <InteractiveAdHocQuestion
          questionPath={redirectUrl}
          title={false}
          onNavigateBack={() => {}}
          isSaveEnabled={false}
        >
          <InteractiveQuestionDefaultView
            withChartTypeSelector
            title={
              <Stack gap="sm" mb="1rem">
                <QuestionTitle />
                <QuestionDetails />
              </Stack>
            }
          />
        </InteractiveAdHocQuestion>
      )}
      <Disclaimer />
    </Flex>
  );
};

interface MessageProps {
  message: string;
}
function Message({ message }: MessageProps) {
  const isErrorMessage = message === getErrorMessage();
  if (isErrorMessage) {
    return (
      <Paper shadow="sm" p="lg" w="100%" maw="41.5rem" radius="lg" ta="center">
        <Icon name="info_filled" c="var(--mb-color-text-tertiary)" size={32} />
        <Text mt="sm">{message}</Text>
      </Paper>
    );
  }

  return (
    <Paper shadow="sm" p="lg" w="100%" maw="41.5rem" radius="lg">
      <Text>{message}</Text>
    </Paper>
  );
}

function Disclaimer() {
  return (
    <Text c="var(--mb-color-text-secondary)">{t`AI can make mistakes. Double-check results.`}</Text>
  );
}

export const MetabotQuestion = withPublicComponentWrapper(MetabotQuestionInner);
