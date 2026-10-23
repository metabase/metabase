import { useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useLocation } from "metabase/router";
import { NavLink, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

import { useHelpAssistantChatContext } from "./HelpAssistantChatContext";

// Enough to find a recent chat, without pushing the other Help pages down.
const VISIBLE_CHAT_COUNT = 5;

export function HelpAssistantRecentChats() {
  const { conversations } = useHelpAssistantChatContext();
  const { pathname } = useLocation();
  const [isShowingAll, setIsShowingAll] = useState(false);

  if (conversations.length === 0) {
    return null;
  }

  const openChatIndex = conversations.findIndex(
    ({ id }) => pathname === Urls.adminHelpChat(id),
  );
  // An older chat that is open stays in view.
  const isOpenChatHidden = openChatIndex >= VISIBLE_CHAT_COUNT;
  const visibleConversations =
    isShowingAll || isOpenChatHidden
      ? conversations
      : conversations.slice(0, VISIBLE_CHAT_COUNT);
  const canToggle =
    conversations.length > VISIBLE_CHAT_COUNT && !isOpenChatHidden;

  return (
    <Stack gap={0} pl="lg" aria-label={t`Recent chats`}>
      {visibleConversations.map(({ id, title }) => {
        const path = Urls.adminHelpChat(id);
        return (
          <NavLink
            key={id}
            component={Link}
            to={path}
            variant="secondary"
            label={title}
            // The label is cut to one line, so show all of it on hover.
            title={title}
            noWrap
            mb="xxs"
            active={pathname === path}
          />
        );
      })}
      {canToggle && (
        <NavLink
          component="button"
          // The theme makes every NavLink a link. This one only shows more chats.
          role="button"
          variant="secondary"
          c="text-secondary"
          label={isShowingAll ? t`Show fewer` : t`Show all`}
          mb="xxs"
          onClick={() => setIsShowingAll(!isShowingAll)}
        />
      )}
    </Stack>
  );
}
