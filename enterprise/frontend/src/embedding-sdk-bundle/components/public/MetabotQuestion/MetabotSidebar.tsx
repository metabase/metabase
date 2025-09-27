import { useMemo } from "react";

import { Stack } from "metabase/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";
import {
  useMetabotAgent,
  useMetabotChatHandlers,
} from "metabase-enterprise/metabot/hooks";

import S from "./MetabotQuestion.module.css";
import { SidebarChatHistory } from "./SidebarChatHistory";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarInput } from "./SidebarInput";

export function MetabotSidebar() {
  const metabot = useMetabotAgent();
  const { handleSubmitInput } = useMetabotChatHandlers();

  // Keep in sync with [MetabotChat.tsx]
  const suggestedPromptsQuery = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabot.metabotId,
    limit: 3,
    sample: true,
  });

  const suggestedPrompts = useMemo(() => {
    return suggestedPromptsQuery.currentData?.prompts ?? [];
  }, [suggestedPromptsQuery]);

  const hasMessages =
    metabot.messages.length > 0 || metabot.errorMessages.length > 0;

  return (
    <Stack className={S.sidebar}>
      <SidebarHeader />
      <SidebarChatHistory />

      <SidebarInput
        suggestedPrompts={suggestedPrompts}
        hasMessages={hasMessages}
        onSubmitPrompt={handleSubmitInput}
      />
    </Stack>
  );
}
