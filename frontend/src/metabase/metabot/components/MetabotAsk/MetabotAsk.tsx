import { useEffect } from "react";

import type { MetabotConfig } from "metabase/metabot/components/Metabot";
import { MetabotChat } from "metabase/metabot/components/MetabotChat";
import { MetabotConversationHistory } from "metabase/metabot/components/MetabotChat/MetabotConversationHistory";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { Box, Flex } from "metabase/ui";

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
  const { setVisible: setSidebarVisible } = useMetabotAgent("omnibot");
  const askAgent = useMetabotAgent("ask");
  const { messages, isDoingScience } = askAgent;
  const { isConfigured } = useUserMetabotPermissions();

  useEffect(
    function closeSidebarOnMount() {
      setSidebarVisible(false);
    },
    [setSidebarVisible],
  );

  const showGreeting = messages.length === 0 && !isDoingScience;

  const historyAction = isConfigured ? (
    <MetabotConversationHistory
      profileId={askAgent.profile}
      activeConversationId={askAgent.conversationId}
      onConversationSelect={askAgent.loadConversation}
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
