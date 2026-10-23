import { t } from "ttag";

import { useLocation, useNavigate } from "metabase/router";
import { NavLink, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

import { isHelpAssistantPath } from "../utils";

import { useHelpAssistantChatContext } from "./HelpAssistantChatContext";

export function HelpAssistantRecentChats() {
  const { conversations, conversationId, openConversation } =
    useHelpAssistantChatContext();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAssistantPage = isHelpAssistantPath(pathname);

  if (conversations.length === 0) {
    return null;
  }

  return (
    <Stack gap={0} pl="lg" aria-label={t`Recent chats`}>
      {conversations.map(({ id, title }) => (
        <NavLink
          key={id}
          component="button"
          // The theme makes every NavLink a link. This one opens the chat in place.
          role="button"
          variant="secondary"
          label={title}
          // The label is cut to one line, so show all of it on hover.
          title={title}
          noWrap
          mb="xxs"
          active={isAssistantPage && id === conversationId}
          onClick={() => {
            openConversation(id);
            navigate(Urls.adminHelp());
          }}
        />
      ))}
    </Stack>
  );
}
