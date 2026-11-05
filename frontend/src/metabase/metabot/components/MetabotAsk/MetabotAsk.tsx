import { useEffect } from "react";
import { t } from "ttag";

import { MetabotChat } from "metabase/metabot/components/MetabotChat";
import { MetabotConversationHistory } from "metabase/metabot/components/MetabotChat/MetabotConversationHistory";
import { isHistoryEnabledProfile } from "metabase/metabot/constants";
import {
  useIsAskPage,
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { setIsAskChatFloating } from "metabase/metabot/state";
import { useDispatch } from "metabase/redux";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { useNavigate } from "metabase/router";
import { ActionIcon, Box, Flex, Icon, Tooltip } from "metabase/ui";
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
  const dispatch = useDispatch();
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

  // PROTOTYPE: collapse the conversation into a floating card on the home page
  const handleCollapse = () => {
    dispatch(setIsAskChatFloating(true));
    navigate("/");
  };

  const chatHeaderActions = (
    <Flex gap="sm" align="center">
      {historyAction}
      {!isAskPage && (
        <Tooltip label={t`Move to side panel`} position="bottom">
          <ActionIcon
            variant="subtle"
            aria-label={t`Move to side panel`}
            onClick={handleCollapse}
          >
            <Icon c="text-primary" name="sidebar_open" />
          </ActionIcon>
        </Tooltip>
      )}
    </Flex>
  );

  return (
    <Flex
      direction="column"
      h="100%"
      w="100%"
      bg="background_page-primary"
      pos="relative"
    >
      {showGreeting ? (
        <>
          {historyAction && (
            <Box className={S.historyAction}>{historyAction}</Box>
          )}
          <MetabotGreeting
            conversationId={conversationId}
            suggestionModels={SUGGESTION_MODELS}
          />
        </>
      ) : (
        <Box pos="relative" h="100%" w="100%">
          <MetabotChat
            conversationId={conversationId}
            agentId="ask"
            size="lg"
            onNewConversation={() =>
              navigate(Urls.newQuestion({ mode: "ask" }))
            }
            config={{ suggestionModels: SUGGESTION_MODELS }}
            className={S.chat}
            headerActions={chatHeaderActions}
          />
        </Box>
      )}
    </Flex>
  );
};
