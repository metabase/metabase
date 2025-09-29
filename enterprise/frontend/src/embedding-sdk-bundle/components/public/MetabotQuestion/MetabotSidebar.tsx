import { Stack } from "metabase/ui";

import S from "./MetabotQuestion.module.css";
import { SidebarChatHistory } from "./SidebarChatHistory";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarInput } from "./SidebarInput";

export function MetabotSidebar() {
  return (
    <Stack className={S.sidebar}>
      <SidebarHeader />
      <SidebarChatHistory />
      <SidebarInput />
    </Stack>
  );
}
