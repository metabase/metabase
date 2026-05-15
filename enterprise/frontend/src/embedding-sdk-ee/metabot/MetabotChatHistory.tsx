import { useEffect, useMemo, useRef } from "react";

import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotResetLongChatButton } from "metabase/metabot/components/MetabotChat/MetabotResetLongChatButton";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useMetabotReactions } from "metabase/metabot/hooks/use-metabot-reactions";
import type { MetabotChatMessage } from "metabase/metabot/state";
import { Stack } from "metabase/ui";

import S from "./MetabotQuestion.module.css";

const isQuestionNavigationMessage = (message: MetabotChatMessage) =>
  message.type === "data_part" && message.part.type === "navigate_to";

export function MetabotChatHistory() {
  const metabot = useMetabotAgent();
  const { messages } = metabot;
  const { setNavigateToPath } = useMetabotReactions();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const chatMessages = useMemo(
    () => messages.filter((message) => !isQuestionNavigationMessage(message)),
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
      p="md"
      className={S.chatHistory}
    >
      {hasMessages ? (
        <Messages
          messages={chatMessages}
          onRetryMessage={metabot.retryMessage}
          isDoingScience={metabot.isDoingScience}
          debug={metabot.debugMode}
          onInternalLinkClick={setNavigateToPath}
        />
      ) : null}
      {metabot.isLongConversation && (
        <MetabotResetLongChatButton
          onResetConversation={metabot.resetConversation}
        />
      )}
    </Stack>
  );
}
