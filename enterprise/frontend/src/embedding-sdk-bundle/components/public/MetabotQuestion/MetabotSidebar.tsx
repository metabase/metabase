import { Stack } from "metabase/ui";

import { MetabotChatHistory } from "./MetabotChatHistory";
import { MetabotChatInput } from "./MetabotChatInput";
import { MetabotChatSuggestions } from "./MetabotChatSuggestions";
import S from "./MetabotQuestion.module.css";
import { SidebarHeader } from "./SidebarHeader";

export function MetabotSidebar() {
  return (
    <Stack className={S.sidebar}>
      <SidebarHeader />
      <MetabotChatHistory />

      <Stack gap={0}>
        <MetabotChatSuggestions />
        <MetabotChatInput />
      </Stack>
    </Stack>
  );
}
