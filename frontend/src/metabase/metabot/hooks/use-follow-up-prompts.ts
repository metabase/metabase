import { skipToken } from "@reduxjs/toolkit/query";
import { useState } from "react";

import { useGetMetabotFollowUpPromptsQuery } from "metabase/metabot/api";
import { getCompletedResponseId } from "metabase/metabot/state";
import { useSelector } from "metabase/redux";

const NO_PROMPTS: string[] = [];

export function useFollowUpPrompts(conversationId: string, enabled: boolean) {
  const messageId = useSelector((state) =>
    getCompletedResponseId(state, conversationId),
  );
  const [initialResponse, setInitialResponse] = useState({
    conversationId,
    messageId,
  });
  if (initialResponse.conversationId !== conversationId) {
    setInitialResponse({ conversationId, messageId });
  }

  const eligible =
    enabled &&
    initialResponse.conversationId === conversationId &&
    messageId &&
    messageId !== initialResponse.messageId;
  const { currentData } = useGetMetabotFollowUpPromptsQuery(
    eligible
      ? { conversation_id: conversationId, message_id: messageId }
      : skipToken,
  );

  return eligible ? (currentData?.prompts ?? NO_PROMPTS) : NO_PROMPTS;
}
