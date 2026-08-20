import { useEffect } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { GenericError } from "metabase/common/components/ErrorPages";
import { MetabotAsk } from "metabase/metabot/components/MetabotAsk";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import {
  getIsConversationEmpty,
  getIsConversationInProgress,
  setConversationSnapshot,
} from "metabase/metabot/state";
import { normalizeFetchedChatMessages } from "metabase/metabot/utils/normalize-fetched-chat-messages";
import { useDispatch, useSelector } from "metabase/redux";
import { Navigate, useParams } from "metabase/router";
import { getSettingsLoading } from "metabase/settings";
import { Center, Loader } from "metabase/ui";
import * as Urls from "metabase/urls";

import { useGetMetabotConversationQuery } from "../../api";

export const IN_PROGRESS_POLL_MS = 2500;

export const MetabotConversationPage = () => {
  const { convoId: urlConvoId } = useParams<{ convoId: string }>();
  const dispatch = useDispatch();
  const { canUseNlq, isLoading } = useUserMetabotPermissions();
  const { conversationId } = useMetabotAgent("ask");

  const isAttached = urlConvoId != null && conversationId === urlConvoId;

  const isSettingsLoading = useSelector(getSettingsLoading);
  const isInProgress = useSelector((state) =>
    isAttached ? getIsConversationInProgress(state, urlConvoId) : false,
  );
  const isEmpty = useSelector((state) =>
    isAttached ? getIsConversationEmpty(state, urlConvoId) : true,
  );

  const { currentData: conversation, isError } = useGetMetabotConversationQuery(
    !urlConvoId || !canUseNlq || (!isEmpty && !isInProgress)
      ? skipToken
      : urlConvoId,
    {
      pollingInterval: isInProgress ? IN_PROGRESS_POLL_MS : 0,
    },
  );

  useEffect(
    function syncUrlConvoToStore() {
      if (!conversation) {
        return;
      }

      dispatch(
        setConversationSnapshot({
          conversationId: conversation.conversation_id,
          title: conversation.title ?? undefined,
          forkedFromConversationId:
            conversation.forked_from_conversation_id ?? undefined,
          messages: normalizeFetchedChatMessages(conversation.messages),
          state: conversation.state,
          activeToolCalls: [],
        }),
      );
    },
    [conversation, dispatch],
  );

  if (isSettingsLoading || isLoading) {
    return <ConversationLoader />;
  }

  if (!canUseNlq || !urlConvoId) {
    return <Navigate to={Urls.newQuestion({ mode: "ask" })} replace />;
  }

  if (isError) {
    return <ConversationLoadError />;
  }

  if (!isAttached || isEmpty) {
    return <ConversationLoader />;
  }

  return <MetabotAsk />;
};

const ConversationLoader = () => (
  <Center
    h="100%"
    w="100%"
    bg="background_page-primary"
    data-testid="metabot-conversation-loading"
  >
    <Loader size="lg" />
  </Center>
);

const ConversationLoadError = () => (
  <GenericError
    title={t`Unable to load this conversation`}
    message={t`Try refreshing the page.`}
    details={undefined}
  />
);
