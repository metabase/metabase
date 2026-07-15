import { useEffect } from "react";
import { t } from "ttag";

import { useGetMetabotConversationQuery } from "metabase/api/metabot";
import { GenericError } from "metabase/common/components/ErrorPages";
import { MetabotAsk } from "metabase/metabot/components/MetabotAsk";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import {
  getIsConversationInProgress,
  setConversationSnapshot,
} from "metabase/metabot/state";
import { normalizeFetchedChatMessages } from "metabase/metabot/utils/normalize-fetched-chat-messages";
import { useDispatch, useSelector } from "metabase/redux";
import { Navigate } from "metabase/router";
import { getSettingsLoading } from "metabase/selectors/settings";
import { Center, Loader } from "metabase/ui";
import * as Urls from "metabase/urls";

// While a resumed conversation's latest turn is still streaming (owned by
// another session), re-fetch on this cadence until it finishes.
export const IN_PROGRESS_POLL_MS = 2500;

export const MetabotConversationPage = ({
  params: { convoId: urlConvoId },
}: {
  params: { convoId: string };
}) => {
  const dispatch = useDispatch();
  const { canUseNlq, isLoading } = useUserMetabotPermissions();
  const { conversationId } = useMetabotAgent("ask");

  const isSettingsLoading = useSelector(getSettingsLoading);
  const isInProgress = useSelector((state) =>
    getIsConversationInProgress(state, "ask"),
  );

  const isConvoLoaded = conversationId === urlConvoId;

  const { currentData: conversation, isError } = useGetMetabotConversationQuery(
    urlConvoId,
    {
      skip: !canUseNlq || (isConvoLoaded && !isInProgress),
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
          agentId: "ask",
          conversationId: conversation.conversation_id,
          title: conversation.title ?? undefined,
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

  if (!canUseNlq) {
    return <Navigate to={Urls.newQuestion({ mode: "ask" })} replace />;
  }

  if (isError) {
    return <ConversationLoadError />;
  }

  if (!isConvoLoaded) {
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
