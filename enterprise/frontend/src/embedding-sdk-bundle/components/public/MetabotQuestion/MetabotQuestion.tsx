import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkAdHocQuestion } from "embedding-sdk-bundle/components/private/SdkAdHocQuestion";
import { SdkQuestionDefaultView } from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView";
import { useSdkDispatch } from "embedding-sdk-bundle/store";
import { useLocale } from "metabase/common/hooks/use-locale";
import { Flex, Paper, Stack, Text } from "metabase/ui";
import { Messages } from "metabase-enterprise/metabot/components/MetabotChat/MetabotChatMessage";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
import { addNavigateToHandler } from "metabase-enterprise/metabot/state";

import { MetabotChatEmbedding } from "./MetabotChatEmbedding";
import { QuestionDetails } from "./QuestionDetails";
import { QuestionTitle } from "./QuestionTitle";

const MetabotQuestionInner = () => {
  const { isLocaleLoading } = useLocale();
  const [adHocQuestionUrl, setAdHocQuestionUrl] = useState<string>("");
  const dispatch = useSdkDispatch();

  useEffect(() => {
    dispatch(addNavigateToHandler(setAdHocQuestionUrl));
  }, [dispatch]);

  if (isLocaleLoading) {
    return <SdkLoader />;
  }

  return (
    <Flex direction="column" align="center" gap="md">
      <MetabotMessages handleAdHocQuestionLink={setAdHocQuestionUrl} />

      <MetabotChatEmbedding />

      {adHocQuestionUrl && (
        <SdkAdHocQuestion
          questionPath={adHocQuestionUrl}
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

interface MessageProps {
  handleAdHocQuestionLink: (queryLink: string) => void;
}

function MetabotMessages({ handleAdHocQuestionLink }: MessageProps) {
  const metabot = useMetabotAgent();
  const { messages, errorMessages } = metabot;

  if (!messages.length && !errorMessages.length) {
    return null;
  }

  return (
    <Paper shadow="sm" p="lg" w="100%" maw="41.5rem" radius="lg">
      <Flex direction="column">
        <Messages
          messages={messages}
          errorMessages={errorMessages}
          isDoingScience={metabot.isDoingScience}
          showFeedbackButtons={false}
          onInternalLinkClick={handleAdHocQuestionLink}
        />
      </Flex>
    </Paper>
  );
}

function Disclaimer() {
  return (
    <Text c="var(--mb-color-text-secondary)">{t`AI can make mistakes. Double-check results.`}</Text>
  );
}

export const MetabotQuestion = withPublicComponentWrapper(MetabotQuestionInner);
