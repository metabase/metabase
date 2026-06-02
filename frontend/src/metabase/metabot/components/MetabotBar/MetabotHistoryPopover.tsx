import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListMetabotChatConversationsQuery } from "metabase/api/metabot";
import {
  getVisibleAgentId,
  resumeChatConversation,
  setVisible,
} from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";
import { ActionIcon, Icon, Loader, Popover, Tooltip } from "metabase/ui";
import type { MetabotChatConversationSummary } from "metabase-types/api";

import S from "./MetabotHistoryPopover.module.css";

type Bucket = {
  key: string;
  label: string;
  rank: number;
  items: MetabotChatConversationSummary[];
};

const bucketLabelsByRank = (rank: number): string =>
  // rank 0–3 use fixed labels; ≥4 is a per-month label produced inline below.
  rank === 0
    ? t`Today`
    : rank === 1
      ? t`Yesterday`
      : rank === 2
        ? t`Previous 7 days`
        : t`Previous 30 days`;

export function bucketForDate(
  date: dayjs.Dayjs,
  now: dayjs.Dayjs,
): { key: string; rank: number; label: string } {
  if (date.isSame(now, "day")) {
    return { key: "today", rank: 0, label: bucketLabelsByRank(0) };
  }
  const yesterday = now.subtract(1, "day");
  if (date.isSame(yesterday, "day")) {
    return { key: "yesterday", rank: 1, label: bucketLabelsByRank(1) };
  }
  if (date.isAfter(now.subtract(7, "day"), "day")) {
    return { key: "prev7", rank: 2, label: bucketLabelsByRank(2) };
  }
  if (date.isAfter(now.subtract(30, "day"), "day")) {
    return { key: "prev30", rank: 3, label: bucketLabelsByRank(3) };
  }
  const monthKey = date.format("YYYY-MM");
  return { key: `month-${monthKey}`, rank: 4, label: date.format("MMMM YYYY") };
}

function getActivityDate(c: MetabotChatConversationSummary): string {
  return c.last_message_at ?? c.created_at;
}

function groupConversationsByDate(
  items: MetabotChatConversationSummary[],
): Bucket[] {
  const now = dayjs();
  const byKey: Record<string, Bucket> = {};
  for (const item of items) {
    const date = dayjs(getActivityDate(item));
    const { key, rank, label } = bucketForDate(date, now);
    if (!byKey[key]) {
      byKey[key] = { key, label, rank, items: [] };
    }
    byKey[key].items.push(item);
  }
  return Object.values(byKey).sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    // monthly buckets: most recent first
    return (
      dayjs(getActivityDate(b.items[0])).valueOf() -
      dayjs(getActivityDate(a.items[0])).valueOf()
    );
  });
}

function rowLabel(item: MetabotChatConversationSummary): string {
  return item.title ?? item.summary ?? t`Untitled conversation`;
}

export function shortRelativeTime(
  iso: string,
  now: dayjs.Dayjs = dayjs(),
): string {
  const then = dayjs(iso);
  const diffSec = now.diff(then, "second");
  if (diffSec < 60) {
    return t`just now`;
  }
  const diffMin = now.diff(then, "minute");
  if (diffMin < 60) {
    return t`${diffMin}m ago`;
  }
  const diffH = now.diff(then, "hour");
  if (diffH < 24) {
    return t`${diffH}h ago`;
  }
  const diffD = now.diff(then, "day");
  if (diffD < 30) {
    return t`${diffD}d ago`;
  }
  const diffMo = now.diff(then, "month");
  if (diffMo < 12) {
    return t`${diffMo}mo ago`;
  }
  const diffY = now.diff(then, "year");
  return t`${diffY}y ago`;
}

export function MetabotHistoryPopover() {
  const dispatch = useDispatch();
  const [opened, setOpened] = useState(false);
  const visibleAgentId = useSelector(getVisibleAgentId);

  const { data, isLoading, isError } = useListMetabotChatConversationsQuery(
    { limit: 100 },
    { skip: !opened },
  );

  const buckets = useMemo(
    () => (data?.data ? groupConversationsByDate(data.data) : []),
    [data],
  );

  const handleRowClick = (conversationId: string) => {
    if (visibleAgentId && visibleAgentId !== `chat_${conversationId}`) {
      dispatch(setVisible({ agentId: visibleAgentId, visible: false }));
    }
    dispatch(resumeChatConversation({ conversationId }))
      .unwrap()
      .catch((err) => {
        console.error("[metabot] failed to resume conversation", err);
      });
    setOpened(false);
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      width={300}
      withinPortal
    >
      <Popover.Target>
        <Tooltip label={t`Recent chats`} position="bottom">
          <ActionIcon
            className={S.iconButton}
            variant="subtle"
            size="sm"
            aria-label={t`Recent chats`}
            onClick={() => setOpened((v) => !v)}
            data-testid="metabot-history-trigger"
          >
            <Icon name="history" size={14} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown className={S.dropdown}>
        <div className={S.scroller} data-testid="metabot-history-list">
          {isLoading && (
            <div className={S.empty}>
              <Loader size="xs" />
            </div>
          )}
          {!isLoading && isError && (
            <div
              className={S.empty}
            >{t`We couldn't load your recent chats.`}</div>
          )}
          {!isLoading && !isError && buckets.length === 0 && (
            <div className={S.empty}>{t`No recent chats yet.`}</div>
          )}
          {buckets.map((bucket) => (
            <div key={bucket.key}>
              <div className={S.bucketLabel}>{bucket.label}</div>
              {bucket.items.map((item) => (
                <button
                  type="button"
                  key={item.conversation_id}
                  className={S.row}
                  onClick={() => handleRowClick(item.conversation_id)}
                >
                  <Icon name="comment" size={14} className={S.rowIcon} />
                  <span className={S.rowTitle}>{rowLabel(item)}</span>
                  <span className={S.rowSubtitle}>
                    {shortRelativeTime(getActivityDate(item))}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
