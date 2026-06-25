import { useEffect } from "react";

import type { MetabotConfig } from "metabase/metabot/components/Metabot";
import { MetabotChat } from "metabase/metabot/components/MetabotChat";
import { useMetabotAgent } from "metabase/metabot/hooks";
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
  const { messages, isDoingScience } = useMetabotAgent("ask");

  useEffect(
    function closeSidebarOnMount() {
      setSidebarVisible(false);
    },
    [setSidebarVisible],
  );

  const showGreeting = messages.length === 0 && !isDoingScience;

  return (
    <Flex h="100%" w="100%" justify="center" bg="background_page-primary">
      {showGreeting ? (
        <MetabotGreeting agentId="ask" suggestionModels={SUGGESTION_MODELS} />
      ) : (
        <Box pos="relative" h="100%" w="100%">
          <Box className={S.topFade} />
          <MetabotChat config={askConfig} className={S.chat} />
        </Box>
      )}
    </Flex>
  );
};
