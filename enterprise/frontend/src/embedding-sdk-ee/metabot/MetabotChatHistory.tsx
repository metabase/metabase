import { useEffect, useRef } from "react";

import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotResetLongChatButton } from "metabase/metabot/components/MetabotChat/MetabotResetLongChatButton";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useMetabotReactions } from "metabase/metabot/hooks/use-metabot-reactions";
import { Stack } from "metabase/ui";

import S from "./MetabotQuestion.module.css";

export function MetabotChatHistory() {
  const metabot = useMetabotAgent();
  const { messages, errorMessages } = metabot;
  const { setNavigateToPath } = useMetabotReactions();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0 || errorMessages.length > 0;

  // Auto-scroll to bottom when new messages are received
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [messages.length, errorMessages.length, metabot.isDoingScience]);

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
          messages={messages}
          errorMessages={errorMessages}
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
