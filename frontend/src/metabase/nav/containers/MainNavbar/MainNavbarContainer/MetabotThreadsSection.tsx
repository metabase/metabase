import dayjs from "dayjs";
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
  setHasUnreadResponse,
} from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import {
  ActionIcon,
  Box,
  Button,
  Icon,
  Loader,
  Text,
  Tooltip,
} from "metabase/ui";

import { PaddedSidebarLink, SidebarHeading } from "../MainNavbar.styled";

const NEW_CHAT_URL = "/";
// fetch enough history that chats older than 24h are available for the "Past
// chats" section, not just the most recent handful
const CONVERSATIONS_LIMIT = 100;
const UNREAD_DOT_SIZE = 8;
// chats created within this window stay in "Recent Chats"; older ones drop into
// the collapsed "Past chats" section
const RECENT_WINDOW_HOURS = 24;
// recent chats collapse to this many rows until the user expands the section
const MAX_VISIBLE_ROWS = 10;

type ThreadRow = {
  conversationId: string;
  title: string | null;
  summary: string | null;
  isProcessing: boolean;
  hasUnreadResponse: boolean;
  // null for in-memory conversations not yet persisted — always treated as recent
  createdAt: string | null;
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
      conv.hasUnreadResponse === other.hasUnreadResponse
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
  const [showAllRecent, setShowAllRecent] = useState(false);
  const { hasMetabotAccess } = useUserMetabotPermissions();
  const pathname = useSelector((state) => getLocation(state).pathname) ?? "";
  const activeConversations = useSelector(
    getActiveChatConversations,
    areActiveConversationsEqual,
  );

  const { data, isLoading } = useListMetabotChatConversationsQuery(
    { limit: CONVERSATIONS_LIMIT },
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
      createdAt: null,
    }));

  const apiRows: ThreadRow[] = apiConversations.map((c) => ({
    conversationId: c.conversation_id,
    title: c.title,
    summary: c.summary,
    isProcessing: processingById.get(c.conversation_id) ?? false,
    hasUnreadResponse: unreadById.get(c.conversation_id) ?? false,
    createdAt: c.created_at,
  }));

  const rows = [...pendingRows, ...apiRows];
  const rowConversationIds = rows.map((row) => row.conversationId);

  const recentCutoff = dayjs().subtract(RECENT_WINDOW_HOURS, "hour");
  const isRecent = (row: ThreadRow) =>
    row.createdAt == null || dayjs(row.createdAt).isAfter(recentCutoff);
  const recentRows = rows.filter(isRecent);
  const pastRows = rows.filter((row) => !isRecent(row));

  // The selected thread is the one the user is currently in: the conversation
  // in the URL, or — on the new-chat home page — the inline draft (so a freshly
  // opened "New chat" reads as selected).
  const urlChatId = pathname.match(/^\/chat\/([^/]+)/)?.[1];
  const homeDraftId =
    pathname === NEW_CHAT_URL ? pendingRows[0]?.conversationId : undefined;
  const activeConversationId = urlChatId ?? homeDraftId;

  useEffect(() => {
    setUnreadConversationIds((currentIds) => {
      let nextIds = currentIds;
      const activeConversationIds = new Set(
        activeConversations.map((conversation) => conversation.conversationId),
      );
      const visibleRowConversationIds = new Set(rowConversationIds);

      const isConversationFocused = (conversationId: string) =>
        conversationId === urlChatId ||
        (pathname === NEW_CHAT_URL && conversationId === homeDraftId);

      activeConversations.forEach((conversation) => {
        const wasProcessing =
          previousProcessingById.current.get(conversation.conversationId) ??
          false;
        const isFocused = isConversationFocused(conversation.conversationId);

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
  ]);

  if (!hasMetabotAccess) {
    return null;
  }

  const handleNewChat = () => {
    onItemSelect();
    dispatch(push(NEW_CHAT_URL));
  };

  const renderRow = (row: ThreadRow) => {
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
  };

  const newChatAction = (
    <Tooltip label={t`New chat`}>
      <ActionIcon
        aria-label={t`New chat`}
        color="text-secondary"
        onClick={handleNewChat}
      >
        <Icon name="add" />
      </ActionIcon>
    </Tooltip>
  );

  const visibleRecentRows = showAllRecent
    ? recentRows
    : recentRows.slice(0, MAX_VISIBLE_ROWS);

  return (
    <Box
      role="section"
      aria-label={t`Metabot`}
      mt="sm"
      pl="md"
      pr="6px"
      data-testid="metabot-threads-section"
    >
      <ErrorBoundary>
        <CollapseSection
          header={<SidebarHeading>{t`Recent Chats`}</SidebarHeading>}
          initialState="expanded"
          iconPosition="right"
          iconSize={8}
          rightAction={newChatAction}
          role="section"
          aria-label={t`Recent Chats`}
        >
          {isLoading && rows.length === 0 ? (
            <Box pl="md" py="xs">
              <Loader size="xs" />
            </Box>
          ) : recentRows.length === 0 ? (
            <Text pl="md" py="xs" c="text-secondary" fz="sm">
              {t`No recent chats`}
            </Text>
          ) : (
            <>
              {visibleRecentRows.map(renderRow)}
              {recentRows.length > MAX_VISIBLE_ROWS && (
                <Button
                  variant="subtle"
                  size="xs"
                  fz="xs"
                  c="text-secondary"
                  pl="16px"
                  onClick={() => setShowAllRecent((v) => !v)}
                >
                  {showAllRecent ? t`Show less` : t`Show more`}
                </Button>
              )}
            </>
          )}
        </CollapseSection>
        {pastRows.length > 0 && (
          <Box mt="sm">
            <CollapseSection
              header={<SidebarHeading>{t`Past chats`}</SidebarHeading>}
              initialState="collapsed"
              iconPosition="right"
              iconSize={8}
              role="section"
              aria-label={t`Past chats`}
            >
              {pastRows.map(renderRow)}
            </CollapseSection>
          </Box>
        )}
      </ErrorBoundary>
    </Box>
  );
}
