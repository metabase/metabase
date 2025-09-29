import { useEffect, useRef } from "react";

import { Stack } from "metabase/ui";
import { Messages } from "metabase-enterprise/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotResetLongChatButton } from "metabase-enterprise/metabot/components/MetabotChat/MetabotResetLongChatButton";
import {
  useMetabotAgent,
  useMetabotChatHandlers,
} from "metabase-enterprise/metabot/hooks";
import { useMetabotReactions } from "metabase-enterprise/metabot/hooks/use-metabot-reactions";

export function MetabotChatHistory() {
  const metabot = useMetabotAgent();
  const { messages, errorMessages } = metabot;
  const { handleRetryMessage } = useMetabotChatHandlers();
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
    >
      {hasMessages ? (
        <Messages
          messages={messages}
          errorMessages={errorMessages}
          onRetryMessage={handleRetryMessage}
          isDoingScience={metabot.isDoingScience}
          showFeedbackButtons={false}
          onInternalLinkClick={setNavigateToPath}
        />
      ) : null}
      {metabot.isLongConversation && <MetabotResetLongChatButton />}
    </Stack>
  );
}
