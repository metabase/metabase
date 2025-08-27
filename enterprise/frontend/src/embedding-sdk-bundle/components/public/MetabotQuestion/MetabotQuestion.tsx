import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkAdHocQuestion } from "embedding-sdk-bundle/components/private/SdkAdHocQuestion";
import { SdkQuestionDefaultView } from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView";
import { useLocale } from "metabase/common/hooks/use-locale";
import { Flex, Paper, Stack, Text } from "metabase/ui";
import { Messages } from "metabase-enterprise/metabot/components/MetabotChat/MetabotChatMessage";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { MetabotChatEmbedding } from "./MetabotChatEmbedding";
import { QuestionDetails } from "./QuestionDetails";
import { QuestionTitle } from "./QuestionTitle";

const MetabotQuestionInner = () => {
  const { isLocaleLoading } = useLocale();
  const [redirectUrl, setRedirectUrl] = useState<string>("");

  if (isLocaleLoading) {
    return <SdkLoader />;
  }

  return (
    <Flex direction="column" align="center" gap="md">
      <MetabotMessages handleQueryLink={setRedirectUrl} />

      <MetabotChatEmbedding />

      {redirectUrl && (
        <SdkAdHocQuestion
          questionPath={redirectUrl}
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

function parseInternalMarkdownLink(markdown: string): string | null {
  const match = markdown.match(/\[.*?\]\((\/[^\)]+)\)/);
  return match ? match[1] : null;
}

interface MessageProps {
  handleQueryLink: (queryLink: string) => void;
}

function MetabotMessages({ handleQueryLink }: MessageProps) {
  const metabot = useMetabotAgent();
  const { messages, errorMessages } = metabot;

  const messagesWithAutoHandledQueryLinksRef = useRef(new Set());

  const lastAgentMessage = useMemo(() => {
    return [...messages].reverse().find((m) => m.role === "agent") ?? null;
  }, [messages]);

  const lastQueryLink = useMemo(
    () =>
      lastAgentMessage
        ? parseInternalMarkdownLink(lastAgentMessage.message)
        : null,
    [lastAgentMessage],
  );

  useEffect(
    function autoHandleQueryLink() {
      if (!lastQueryLink || !lastAgentMessage) {
        return;
      }

      if (
        messagesWithAutoHandledQueryLinksRef.current.has(lastAgentMessage.id)
      ) {
        return;
      }

      handleQueryLink(lastQueryLink);
      messagesWithAutoHandledQueryLinksRef.current.add(lastAgentMessage.id);
    },
    [lastAgentMessage, lastQueryLink, handleQueryLink],
  );

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
          onInternalLinkClick={handleQueryLink}
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
