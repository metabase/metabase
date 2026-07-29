import { useEffect } from "react";

import type { MetabotConfig } from "metabase/metabot/components/Metabot";
import { MetabotChat } from "metabase/metabot/components/MetabotChat";
import { MetabotConversationHistory } from "metabase/metabot/components/MetabotChat/MetabotConversationHistory";
import { isHistoryEnabledProfile } from "metabase/metabot/constants";
import {
  useIsAskPage,
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { useDispatch } from "metabase/redux";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { push, replace } from "metabase/router";
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

const askConfig: MetabotConfig = {
  agentId: "ask",
  suggestionModels: SUGGESTION_MODELS,
};

export const MetabotAsk = () => {
  const dispatch = useDispatch();
  const { setVisible: setSidebarVisible } = useMetabotAgent("omnibot");
  const askAgent = useMetabotAgent("ask");
  const { messages, isDoingScience, conversationId } = askAgent;
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
        dispatch(replace(Urls.metabotConversation(conversationId)));
      }
    },
    [isAskPage, messages.length, conversationId, dispatch],
  );

  const showGreeting = messages.length === 0 && !isDoingScience;

  const showHistory = isConfigured && isHistoryEnabledProfile(askAgent.profile);
  const historyAction = showHistory ? (
    <MetabotConversationHistory
      profileId={askAgent.profile}
      activeConversationId={conversationId}
      onConversationSelect={(id) =>
        dispatch(push(Urls.metabotConversation(id)))
      }
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
          <MetabotGreeting agentId="ask" suggestionModels={SUGGESTION_MODELS} />
        </>
      ) : (
        <Box pos="relative" h="100%" w="100%">
          <Box className={S.topFade} />
          <MetabotChat
            config={askConfig}
            className={S.chat}
            headerActions={historyAction}
          />
        </Box>
      )}
    </Flex>
  );
};
