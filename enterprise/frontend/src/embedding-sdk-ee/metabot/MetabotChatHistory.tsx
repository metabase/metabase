import { useEffect, useMemo, useRef } from "react";

import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotResetLongChatButton } from "metabase/metabot/components/MetabotChat/MetabotResetLongChatButton";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useMetabotReactions } from "metabase/metabot/hooks/use-metabot-reactions";
import type { MetabotChatMessage } from "metabase/metabot/state";
import { Stack } from "metabase/ui";

import S from "./MetabotQuestion.module.css";

const isAdhocVizMessage = (message: MetabotChatMessage) =>
  message.type === "data_part" && message.part.type === "adhoc_viz";

export function MetabotChatHistory() {
  const metabot = useMetabotAgent();
  const { messages } = metabot;
  const { setCurrentQuestionPath } = useMetabotReactions();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Charts are surfaced in the dedicated question pane, so keep them out of the
  // chat transcript here.
  const chatMessages = useMemo(
    () => messages.filter((message) => !isAdhocVizMessage(message)),
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
          agentId="omnibot"
          messages={chatMessages}
          onRetryMessage={metabot.retryMessage}
          isDoingScience={metabot.isDoingScience}
          debug={metabot.debugMode}
          onInternalLinkClick={setCurrentQuestionPath}
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
