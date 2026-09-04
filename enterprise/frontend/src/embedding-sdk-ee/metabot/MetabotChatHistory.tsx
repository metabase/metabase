import { useEffect, useMemo, useRef } from "react";

import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotLongChatNotice } from "metabase/metabot/components/MetabotChat/MetabotLongChatNotice";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useMetabotReactions } from "metabase/metabot/hooks/use-metabot-reactions";
import type { MetabotChatMessage } from "metabase/metabot/state";
import { Stack } from "metabase/ui";

import S from "./MetabotQuestion.module.css";

const isQuestionNavigationMessage = (message: MetabotChatMessage) =>
  message.type === "data_part" &&
  message.part.type === "data-generated_entity" &&
  message.part.data.type === "card";

const isHiddenInEmbedding = (message: MetabotChatMessage) =>
  message.type === "chain_of_thought";

const AGENT_ID = "omnibot";

export function MetabotChatHistory() {
  const metabot = useMetabotAgent(AGENT_ID);
  const { messages } = metabot;
  const { setNavigateToPath } = useMetabotReactions();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const chatMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          !isQuestionNavigationMessage(message) &&
          !isHiddenInEmbedding(message),
      ),
    [messages],
  );

  const hasMessages = chatMessages.length > 0;

  // Auto-scroll to bottom when new messages are received
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [chatMessages.length, metabot.isDoingScience]);

  return (
    <Stack
      ref={scrollContainerRef}
      flex={1}
      gap={0}
      style={{ overflowY: "auto" }}
      p="lg"
      className={S.chatHistory}
    >
      {hasMessages ? (
        <Messages
          messages={chatMessages}
          onRetryMessage={metabot.retryMessage}
          onContinueMessage={metabot.submitInput}
          isDoingScience={metabot.isDoingScience}
          debug={metabot.debugMode}
          conversationId={metabot.conversationId}
          onInternalLinkClick={setNavigateToPath}
        />
      ) : null}
      {metabot.longChatNotice && !metabot.isDoingScience && (
        <MetabotLongChatNotice
          variant={metabot.longChatNotice}
          className={hasMessages ? S.longChatNotice : undefined}
          onNewChat={metabot.createNewConversation}
        />
      )}
    </Stack>
  );
}
