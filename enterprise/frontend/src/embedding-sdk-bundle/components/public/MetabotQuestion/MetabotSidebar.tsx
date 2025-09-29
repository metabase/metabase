import { Stack } from "metabase/ui";

import { MetabotChatHistory } from "./MetabotChatHistory";
import { MetabotChatInput } from "./MetabotChatInput";
import S from "./MetabotQuestion.module.css";
import { SidebarHeader } from "./SidebarHeader";

export function MetabotSidebar() {
  return (
    <Stack className={S.sidebar}>
      <SidebarHeader />
      <MetabotChatHistory />
      <MetabotChatInput />
    </Stack>
  );
}
