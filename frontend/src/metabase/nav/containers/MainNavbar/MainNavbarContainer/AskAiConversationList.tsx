import { useEffect } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useListMetabotConversationsQuery } from "metabase/metabot/api";
import { resolveMetabotProfileId } from "metabase/metabot/constants";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useLocation } from "metabase/router";
import { Button, Icon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";

import { SidebarHeading } from "../Sidebar";
import { SidebarLink } from "../SidebarItems";

const CONVERSATION_LIMIT = 25;
const CONVERSATION_PATH_PREFIX = `/${Urls.CONVERSATION_BASE_PATH}/`;

type ConversationItem = { id: string; title: string };

/**
 * PROTOTYPE: the "Ask AI" variant's Ask AI section — a "New" button for a
 * fresh conversation, then the user's recent Ask AI conversations, newest
 * first, each linking to its conversation page.
 */
export function AskAiConversationList({
  onItemSelect,
}: {
  onItemSelect: () => void;
}) {
  const {
    conversationId: activeConversationId,
    title: activeTitle,
    profile,
  } = useMetabotAgent("ask");
  const { pathname } = useLocation();
  const { data, isLoading, refetch } = useListMetabotConversationsQuery(
    { profile_id: resolveMetabotProfileId(profile), limit: CONVERSATION_LIMIT },
    { refetchOnMountOrArgChange: true },
  );
  const urlConversationId = pathname.startsWith(CONVERSATION_PATH_PREFIX)
    ? pathname.slice(CONVERSATION_PATH_PREFIX.length)
    : undefined;

  // The server only lists a conversation once it's saved, and its title is
  // generated after the first answer. Refetch on both, so the list catches up.
  useEffect(() => {
    if (urlConversationId) {
      refetch();
    }
  }, [urlConversationId, activeTitle, refetch]);

  const listedItems: ConversationItem[] = (data?.data ?? []).map(
    (conversation) => ({
      id: conversation.conversation_id,
      title:
        // The live title can be newer than the listed one.
        (conversation.conversation_id === activeConversationId
          ? activeTitle
          : undefined) ||
        conversation.title ||
        (conversation.forked_from_conversation_id
          ? t`Forked conversation`
          : t`Untitled`),
    }),
  );
  // A conversation just started on the Ask page shows up right away, before
  // the server lists it; its title fills in once it's generated.
  const isNewConversation =
    urlConversationId != null &&
    urlConversationId === activeConversationId &&
    !listedItems.some((item) => item.id === urlConversationId);
  const items: ConversationItem[] = isNewConversation
    ? [
        { id: urlConversationId, title: activeTitle || t`New conversation` },
        ...listedItems,
      ]
    : listedItems;

  return (
    <>
      <Button
        component={ForwardRefLink}
        to={Urls.askQuestion()}
        variant="subtle"
        leftSection={<Icon name="add" />}
        // Puts the icon's center on the nav's icon column.
        ml={5.5}
        onClick={onItemSelect}
      >
        {t`New`}
      </Button>
      <SidebarHeading mt="lg" mb="sm">{t`Recents`}</SidebarHeading>
      {isLoading && !isNewConversation ? null : items.length === 0 ? (
        <Text c="text-secondary" fz="sm" ps="lg">
          {t`No conversations yet.`}
        </Text>
      ) : (
        items.map(({ id, title }) => {
          const url = Urls.metabotConversation(id);
          return (
            <SidebarLink
              key={id}
              icon="message_circle"
              url={url}
              isSelected={pathname === url}
              onClick={onItemSelect}
            >
              {title}
            </SidebarLink>
          );
        })
      )}
    </>
  );
}
