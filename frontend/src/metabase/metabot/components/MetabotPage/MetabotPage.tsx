import { useEffect, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useGetMetabotChatConversationQuery } from "metabase/api";
import {
  type MetabotAgentId,
  createAgent,
  getActiveMetabotAgentIds,
  hydrateChatConversation,
  minimizeConversation,
} from "metabase/metabot/state";
import { normalizeFetchedChatMessages } from "metabase/metabot/utils/normalize-fetched-chat-messages";
import { useDispatch, useSelector } from "metabase/redux";
import { Box, Center, Text } from "metabase/ui";
import { uuid } from "metabase/utils/uuid";

import { MetabotConversationView } from "./MetabotConversationView";
import S from "./MetabotPage.module.css";

type Props = {
  params?: { conversationId?: string };
};

export const MetabotPage = ({ params }: Props) => {
  const urlConversationId = params?.conversationId;
  const dispatch = useDispatch();
  const activeAgentIds = useSelector(getActiveMetabotAgentIds);

  const [draftConversationId] = useState(() => urlConversationId ?? uuid());
  const conversationId = urlConversationId ?? draftConversationId;
  const agentId: MetabotAgentId = `chat_${conversationId}`;
  const agentExists = activeAgentIds.includes(agentId);
  const isNewConversation = !urlConversationId;

  useEffect(() => {
    if (isNewConversation && !agentExists) {
      dispatch(createAgent({ agentId, visible: false, conversationId }));
    }
  }, [dispatch, agentId, agentExists, conversationId, isNewConversation]);

  const conversationQuery = useGetMetabotChatConversationQuery(
    urlConversationId ?? "",
    { skip: !urlConversationId || agentExists },
  );

  useEffect(() => {
    if (!urlConversationId || agentExists || !conversationQuery.data) {
      return;
    }
    const { conversation_id, title, chat_messages, history, state } =
      conversationQuery.data;
    dispatch(
      hydrateChatConversation({
        agentId,
        conversationId: conversation_id,
        title,
        messages: normalizeFetchedChatMessages(chat_messages ?? []),
        history,
        state,
      }),
    );
  }, [
    dispatch,
    agentId,
    agentExists,
    urlConversationId,
    conversationQuery.data,
  ]);

  if (!agentExists) {
    if (urlConversationId && conversationQuery.isError) {
      return (
        <Box className={S.page}>
          {/* TODO: design a real not-found / restore-failure state */}
          <Center h="100%">
            <Text c="text-secondary">{t`We couldn't load this conversation.`}</Text>
          </Center>
        </Box>
      );
    }
    return <Box className={S.page} />;
  }

  const handleMinimize = () => {
    dispatch(minimizeConversation({ agentId }));
    dispatch(push("/"));
  };

  return (
    <MetabotConversationView
      agentId={agentId}
      isNewConversation={isNewConversation}
      headerAction={{
        icon: "chevrondown",
        label: t`Minimize`,
        testId: "metabot-minimize-chat",
        onClick: handleMinimize,
      }}
      onAfterSubmit={
        isNewConversation
          ? () => dispatch(push(`/chat/${conversationId}`))
          : undefined
      }
    />
  );
};
