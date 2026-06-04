import { useEffect, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  useCreateDocumentMutation,
  useGetMetabotChatConversationQuery,
} from "metabase/api";
import {
  type MetabotAgentId,
  createAgent,
  discardConversationIfEmpty,
  getActiveMetabotAgentIds,
  getConversationTitle,
  getMessages,
  hydrateChatConversation,
} from "metabase/metabot/state";
import { conversationToDocument } from "metabase/metabot/utils/conversation-to-document";
import { normalizeFetchedChatMessages } from "metabase/metabot/utils/normalize-fetched-chat-messages";
import { useDispatch, useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import { Box, Center, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { uuid } from "metabase/utils/uuid";

import { MetabotConversationView } from "./MetabotConversationView";
import S from "./MetabotPage.module.css";

type Props = {
  params?: { conversationId?: string };
};

export const MetabotPage = ({ params }: Props) => {
  const dispatch = useDispatch();
  const activeAgentIds = useSelector(getActiveMetabotAgentIds);
  // The chat route doesn't reliably re-deliver `params` when navigating
  // between two /chat/:id links (the auth-wrapper/connect chain can skip the
  // re-render), so derive the id from the location, which updates via redux.
  // `params` remains a fallback for environments where routing isn't synced
  // into the store (e.g. unit tests).
  const pathname = useSelector((state) => getLocation(state).pathname);
  const urlConversationId =
    pathname?.match(/^\/chat\/([^/]+)/)?.[1] ?? params?.conversationId;

  const [draftConversationId] = useState(() => urlConversationId ?? uuid());
  const conversationId = urlConversationId ?? draftConversationId;
  const agentId: MetabotAgentId = `chat_${conversationId}`;
  const agentExists = activeAgentIds.includes(agentId);
  const isNewConversation = !urlConversationId;

  useEffect(() => {
    if (isNewConversation && !agentExists) {
      dispatch(
        createAgent({
          agentId,
          visible: false,
          conversationId,
        }),
      );
    }
  }, [dispatch, agentId, agentExists, conversationId, isNewConversation]);

  // Discard the draft when leaving the page if no message was ever sent, so an
  // abandoned "New chat" doesn't linger in the sidebar history.
  useEffect(
    () => () => {
      dispatch(discardConversationIfEmpty({ agentId }));
    },
    [dispatch, agentId],
  );

  // The conversation selectors throw when no agent exists yet (the agent is
  // created in an effect, one render later), so guard on `agentExists`.
  const messages = useSelector((state) =>
    agentExists ? getMessages(state, agentId) : [],
  );
  const title = useSelector((state) =>
    agentExists ? getConversationTitle(state, agentId) : "",
  );
  const [createDocument] = useCreateDocumentMutation();

  const handleConvertToDocument = async () => {
    const { document, cards } = conversationToDocument(messages);
    const doc = await createDocument({
      name: title || t`Metabot chat`,
      document,
      cards: Object.keys(cards).length > 0 ? cards : undefined,
    }).unwrap();
    dispatch(push(Urls.document(doc)));
  };

  const conversationQuery = useGetMetabotChatConversationQuery(
    urlConversationId ?? "",
    { skip: !urlConversationId || agentExists },
  );

  useEffect(() => {
    if (!urlConversationId || agentExists || !conversationQuery.data) {
      return;
    }
    // While the query transitions to a new conversation id, `data` can still
    // hold the previous conversation's result. Ignore it until the fetched
    // data actually belongs to the conversation in the URL, otherwise we'd
    // hydrate the new agent with the wrong messages/title.
    if (conversationQuery.data.conversation_id !== urlConversationId) {
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

  return (
    <MetabotConversationView
      agentId={agentId}
      isNewConversation={isNewConversation}
      onAfterSubmit={
        isNewConversation
          ? () => dispatch(push(`/chat/${conversationId}`))
          : undefined
      }
      headerAction={
        messages.length > 0
          ? {
              icon: "document",
              label: t`Convert to document`,
              testId: "metabot-convert-to-document",
              onClick: handleConvertToDocument,
            }
          : undefined
      }
    />
  );
};
