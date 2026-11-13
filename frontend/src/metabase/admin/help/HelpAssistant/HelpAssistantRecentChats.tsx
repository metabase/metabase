import { useState } from "react";
import { c, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useLocation } from "metabase/router";
import { ActionIcon, Box, Icon, Menu, NavLink, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

import { useHelpAssistantChatContext } from "./HelpAssistantChatContext";
import S from "./HelpAssistantRecentChats.module.css";
import { useDeleteHelpAssistantChat } from "./use-delete-help-assistant-chat";

// Enough to find a recent chat, without pushing the other Help pages down.
const VISIBLE_CHAT_COUNT = 5;

export function HelpAssistantRecentChats() {
  const { conversations } = useHelpAssistantChatContext();
  const { pathname } = useLocation();
  const [isShowingAll, setIsShowingAll] = useState(false);
  const deleteChat = useDeleteHelpAssistantChat();

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
          <Box key={id} className={S.chat} mb="xxs">
            <NavLink
              component={Link}
              to={path}
              variant="secondary"
              label={title}
              // The label is cut to one line, so show all of it on hover.
              title={title}
              noWrap
              // Room for the menu button, so it doesn't cover the title. Matches
              // the button's width in HelpAssistantRecentChats.module.css.
              pr="2rem"
              active={pathname === path}
            />
            <RecentChatMenu title={title} onDelete={() => deleteChat(id)} />
          </Box>
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

interface RecentChatMenuProps {
  title: string;
  onDelete: () => void;
}

function RecentChatMenu({ title, onDelete }: RecentChatMenuProps) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          className={S.menuButton}
          aria-label={c("{0} is the title of a chat").t`Actions for ${title}`}
        >
          <Icon name="ellipsis" size={12} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<Icon name="trash" />} onClick={onDelete}>
          {t`Delete chat`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
