import { useEffect, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useListMetabotChatConversationsQuery } from "metabase/api/metabot";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import {
  type ActiveChatConversation,
  type MetabotAgentId,
  getActiveChatConversations,
  getVisibleAgentId,
  setHasUnreadResponse,
} from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import { ActionIcon, Box, Icon, Loader, Text, Tooltip } from "metabase/ui";

import {
  PaddedSidebarLink,
  SidebarHeading,
  SidebarSection,
} from "../MainNavbar.styled";

const NEW_CHAT_URL = "/";
const RECENT_CONVERSATIONS_LIMIT = 25;
const UNREAD_DOT_SIZE = 8;

type ThreadRow = {
  conversationId: string;
  title: string | null;
  summary: string | null;
  isProcessing: boolean;
  hasUnreadResponse: boolean;
};

// The selector returns a fresh array on every metabot state change (e.g. each
// streamed token); only re-render the sidebar when the fields we render change.
function areActiveConversationsEqual(
  a: ActiveChatConversation[],
  b: ActiveChatConversation[],
) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((conv, index) => {
    const other = b[index];
    return (
      conv.conversationId === other.conversationId &&
      conv.title === other.title &&
      conv.isProcessing === other.isProcessing &&
      conv.hasUnreadResponse === other.hasUnreadResponse &&
      conv.isVisible === other.isVisible &&
      conv.isExpanded === other.isExpanded
    );
  });
}

type Props = {
  onItemSelect: () => void;
};

export function MetabotThreadsSection({ onItemSelect }: Props) {
  const dispatch = useDispatch();
  const previousProcessingById = useRef(new Map<string, boolean>());
  const [unreadConversationIds, setUnreadConversationIds] = useState(
    () => new Set<string>(),
  );
  const { hasMetabotAccess } = useUserMetabotPermissions();
  const pathname = useSelector((state) => getLocation(state).pathname) ?? "";
  const visibleAgentId = useSelector(getVisibleAgentId);
  const activeConversations = useSelector(
    getActiveChatConversations,
    areActiveConversationsEqual,
  );

  const { data, isLoading } = useListMetabotChatConversationsQuery(
    { limit: RECENT_CONVERSATIONS_LIMIT },
    { skip: !hasMetabotAccess },
  );

  const apiConversations = data?.data ?? [];
  const apiIds = new Set(apiConversations.map((c) => c.conversation_id));
  const processingById = new Map(
    activeConversations.map((c) => [c.conversationId, c.isProcessing]),
  );
  const unreadById = new Map(
    activeConversations.map((c) => [c.conversationId, c.hasUnreadResponse]),
  );

  // In-memory conversations not yet in the persisted list — surface them at the
  // top so a brand-new chat shows up as soon as it's opened (as "New chat"),
  // then spins and gets retitled live once a message is sent.
  const pendingRows: ThreadRow[] = activeConversations
    .filter((c) => !apiIds.has(c.conversationId))
    .map((c) => ({
      conversationId: c.conversationId,
      title: c.title,
      summary: null,
      isProcessing: c.isProcessing,
      hasUnreadResponse: c.hasUnreadResponse,
    }));

  const apiRows: ThreadRow[] = apiConversations.map((c) => ({
    conversationId: c.conversation_id,
    title: c.title,
    summary: c.summary,
    isProcessing: processingById.get(c.conversation_id) ?? false,
    hasUnreadResponse: unreadById.get(c.conversation_id) ?? false,
  }));

  const rows = [...pendingRows, ...apiRows];
  const rowConversationIds = rows.map((row) => row.conversationId);

  // The selected thread is the one the user is currently in: the open popup
  // chat, the conversation in the URL, or — on the new-chat home page — the
  // inline draft (so a freshly opened "New chat" reads as selected).
  const visibleChatId = visibleAgentId?.replace(/^chat_/, "");
  const urlChatId = pathname.match(/^\/chat\/([^/]+)/)?.[1];
  const homeDraftId =
    pathname === NEW_CHAT_URL
      ? pendingRows.find((row) => row.conversationId !== visibleChatId)
          ?.conversationId
      : undefined;
  const activeConversationId = visibleChatId ?? urlChatId ?? homeDraftId;

  useEffect(() => {
    setUnreadConversationIds((currentIds) => {
      let nextIds = currentIds;
      const activeConversationIds = new Set(
        activeConversations.map((conversation) => conversation.conversationId),
      );
      const visibleRowConversationIds = new Set(rowConversationIds);

      const isConversationFocused = (
        conversationId: string,
        conversation?: ActiveChatConversation,
      ) =>
        conversation?.isVisible ||
        conversationId === visibleChatId ||
        conversationId === urlChatId ||
        (pathname === NEW_CHAT_URL && conversationId === homeDraftId);

      activeConversations.forEach((conversation) => {
        const wasProcessing =
          previousProcessingById.current.get(conversation.conversationId) ??
          false;
        const isFocused = isConversationFocused(
          conversation.conversationId,
          conversation,
        );

        if (wasProcessing && !conversation.isProcessing && !isFocused) {
          nextIds = nextIds === currentIds ? new Set(currentIds) : nextIds;
          nextIds.add(conversation.conversationId);
        }

        if (isFocused && nextIds.has(conversation.conversationId)) {
          nextIds = nextIds === currentIds ? new Set(currentIds) : nextIds;
          nextIds.delete(conversation.conversationId);
        }

        if (isFocused && conversation.hasUnreadResponse) {
          dispatch(
            setHasUnreadResponse({
              agentId: `chat_${conversation.conversationId}` as MetabotAgentId,
              hasUnreadResponse: false,
            }),
          );
        }
      });

      previousProcessingById.current.forEach(
        (wasProcessing, conversationId) => {
          if (
            wasProcessing &&
            !activeConversationIds.has(conversationId) &&
            visibleRowConversationIds.has(conversationId) &&
            !isConversationFocused(conversationId)
          ) {
            nextIds = nextIds === currentIds ? new Set(currentIds) : nextIds;
            nextIds.add(conversationId);
          }
        },
      );

      if (urlChatId != null && nextIds.has(urlChatId)) {
        nextIds = nextIds === currentIds ? new Set(currentIds) : nextIds;
        nextIds.delete(urlChatId);
      }

      return nextIds;
    });

    previousProcessingById.current = new Map(
      activeConversations.map((conversation) => [
        conversation.conversationId,
        conversation.isProcessing,
      ]),
    );
  }, [
    activeConversations,
    dispatch,
    homeDraftId,
    pathname,
    rowConversationIds,
    urlChatId,
    visibleChatId,
  ]);

  if (!hasMetabotAccess) {
    return null;
  }

  const handleNewChat = () => {
    onItemSelect();
    dispatch(push(NEW_CHAT_URL));
  };

  return (
    <SidebarSection>
      <ErrorBoundary>
        <CollapseSection
          header={<SidebarHeading>{t`Metabot`}</SidebarHeading>}
          initialState="expanded"
          iconPosition="right"
          iconSize={8}
          rightAction={
            <Tooltip label={t`New chat`}>
              <ActionIcon
                aria-label={t`New chat`}
                color="text-secondary"
                onClick={handleNewChat}
              >
                <Icon name="add" />
              </ActionIcon>
            </Tooltip>
          }
          role="section"
          aria-label={t`Metabot`}
        >
          <Box
            data-testid="metabot-threads-section"
            mah="40vh"
            style={{ overflowY: "auto" }}
          >
            {isLoading && rows.length === 0 ? (
              <Box pl="12px" py="xs">
                <Loader size="xs" />
              </Box>
            ) : rows.length === 0 ? (
              <Text pl="12px" py="xs" c="text-secondary" fz="sm">
                {t`No chats yet`}
              </Text>
            ) : (
              rows.map((row) => {
                const url = `/chat/${row.conversationId}`;
                const label = row.title ?? row.summary ?? t`Untitled chat`;
                return (
                  <PaddedSidebarLink
                    key={row.conversationId}
                    icon="comment"
                    url={url}
                    isSelected={row.conversationId === activeConversationId}
                    onClick={onItemSelect}
                    aria-label={label}
                    right={
                      row.isProcessing ? (
                        <Loader size="xs" data-testid="metabot-thread-loader" />
                      ) : row.hasUnreadResponse ||
                        unreadConversationIds.has(row.conversationId) ? (
                        <Box
                          aria-hidden
                          data-testid="metabot-thread-unread-dot"
                          style={{
                            backgroundColor: "var(--mb-color-brand)",
                            borderRadius: "50%",
                            flex: "0 0 auto",
                            height: UNREAD_DOT_SIZE,
                            width: UNREAD_DOT_SIZE,
                          }}
                        />
                      ) : undefined
                    }
                  >
                    {label}
                  </PaddedSidebarLink>
                );
              })
            )}
          </Box>
        </CollapseSection>
      </ErrorBoundary>
    </SidebarSection>
  );
}
