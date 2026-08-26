import { useEffect } from "react";

import { MetabotChat } from "metabase/metabot/components/MetabotChat";
import { MetabotConversationHistory } from "metabase/metabot/components/MetabotChat/MetabotConversationHistory";
import { isHistoryEnabledProfile } from "metabase/metabot/constants";
import {
  useIsAskPage,
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { useNavigate } from "metabase/router";
import { Box, Flex } from "metabase/ui";
import * as Urls from "metabase/urls";

import S from "./MetabotAsk.module.css";
import { MetabotGreeting } from "./MetabotGreeting";

const SUGGESTION_MODELS: SuggestionModel[] = [
  "dataset",
  "metric",
  "card",
  "table",
  "database",
  "dashboard",
];

export const MetabotAsk = () => {
  const navigate = useNavigate();
  const { setVisible: setSidebarVisible } = useMetabotAgent("omnibot");
  const { conversationId, messages, isDoingScience, profile } =
    useMetabotAgent("ask");
  const { isConfigured } = useUserMetabotPermissions();
  const isAskPage = useIsAskPage();

  useEffect(
    function closeSidebarOnMount() {
      setSidebarVisible(false);
    },
    [setSidebarVisible],
  );

  useEffect(
    function navigateToConversationOnFirstMessage() {
      if (isAskPage && messages.length > 0 && conversationId) {
        navigate(Urls.metabotConversation(conversationId), { replace: true });
      }
    },
    [isAskPage, messages.length, conversationId, navigate],
  );

  const showGreeting = messages.length === 0 && !isDoingScience;

  const showHistory = isConfigured && isHistoryEnabledProfile(profile);
  const historyAction = showHistory ? (
    <MetabotConversationHistory
      profileId={profile}
      activeConversationId={conversationId}
      onConversationSelect={(id) => navigate(Urls.metabotConversation(id))}
    />
  ) : undefined;

  return (
    <Flex direction="column" h="100%" w="100%" bg="background_page-primary">
      {showGreeting ? (
        <>
          {historyAction && (
            <Flex justify="flex-end" px="md" pt="md">
              {historyAction}
            </Flex>
          )}
          <MetabotGreeting
            conversationId={conversationId}
            suggestionModels={SUGGESTION_MODELS}
          />
        </>
      ) : (
        <Box pos="relative" h="100%" w="100%">
          <Box className={S.topFade} />
          <MetabotChat
            conversationId={conversationId}
            agentId="ask"
            onNewConversation={() =>
              navigate(Urls.newQuestion({ mode: "ask" }))
            }
            config={{ suggestionModels: SUGGESTION_MODELS }}
            className={S.chat}
            headerActions={historyAction}
          />
        </Box>
      )}
    </Flex>
  );
};
