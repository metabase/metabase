import cx from "classnames";
import dayjs from "dayjs";
import { memo, useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { formatNotificationSchedule } from "metabase/notifications/utils";
import {
  Badge,
  Box,
  Checkbox,
  Ellipsified,
  Flex,
  Group,
  Icon,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type {
  AdminNotificationListItem,
  NotificationChannelType,
  NotificationHandler,
  NotificationHealth,
  NotificationId,
} from "metabase-types/api";

import {
  getChannelIconName,
  getChannelLabel,
  getHealthColor,
  getHealthLabel,
} from "./utils";

const COLUMN_COUNT = 8;

type Props = {
  notifications: AdminNotificationListItem[];
  error: unknown;
  isLoading: boolean;
  selectedIds: NotificationId[];
  onToggleRow: (id: NotificationId) => void;
  onToggleAll: () => void;
  onRowClick?: (id: NotificationId) => void;
};

export const NotificationsTable = ({
  notifications,
  error,
  isLoading,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowClick,
}: Props) => {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const showLoadingAndErrorWrapper = isLoading || error != null;

  const allSelected =
    notifications.length > 0 &&
    notifications.every((n) => selectedSet.has(n.id));
  const someSelected =
    !allSelected && notifications.some((n) => selectedSet.has(n.id));

  return (
    <table
      className={cx(AdminS.ContentTable, CS.mt2)}
      data-testid="notifications-admin-table"
    >
      <thead>
        <tr>
          <Box component="th" w={40}>
            <Checkbox
              aria-label={t`Select all`}
              checked={allSelected}
              indeterminate={someSelected}
              onChange={onToggleAll}
              disabled={notifications.length === 0}
            />
          </Box>
          <Box component="th" w={72}>{t`ID`}</Box>
          <th>{t`Card`}</th>
          <th>{t`Creator`}</th>
          <th>{t`Schedule`}</th>
          <Box component="th" miw={110}>{t`Recipients`}</Box>
          <Box component="th" miw={180}>{t`Last sent`}</Box>
          <Box component="th" miw={120}>{t`Health`}</Box>
        </tr>
      </thead>

      <tbody>
        {showLoadingAndErrorWrapper && (
          <tr>
            <td colSpan={COLUMN_COUNT}>
              <LoadingAndErrorWrapper loading={isLoading} error={error} />
            </td>
          </tr>
        )}

        {!showLoadingAndErrorWrapper && notifications.length === 0 && (
          <tr>
            <td colSpan={COLUMN_COUNT}>
              <Flex c="text-tertiary" justify="center">{t`No results`}</Flex>
            </td>
          </tr>
        )}

        {!showLoadingAndErrorWrapper &&
          notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              selected={selectedSet.has(notification.id)}
              onToggle={onToggleRow}
              onRowClick={onRowClick}
            />
          ))}
      </tbody>
    </table>
  );
};

type NotificationRowProps = {
  notification: AdminNotificationListItem;
  selected: boolean;
  onToggle: (id: NotificationId) => void;
  onRowClick?: (id: NotificationId) => void;
};

const NotificationRow = memo(function NotificationRow({
  notification,
  selected,
  onToggle,
  onRowClick,
}: NotificationRowProps) {
  const isOrphanedCard = notification.health === "orphaned_card";

  const handlers = useMemo(
    () => notification.handlers ?? [],
    [notification.handlers],
  );
  const subscriptions = notification.subscriptions ?? [];

  const recipientCount = handlers.reduce(
    (total, handler) => total + (handler.recipients?.length ?? 0),
    0,
  );

  const channels = useMemo(() => {
    const types = new Set<NotificationChannelType>();
    handlers.forEach((handler) => {
      types.add(handler.channel_type);
    });
    return Array.from(types);
  }, [handlers]);

  const scheduleLabels = subscriptions
    .map((subscription) => formatNotificationSchedule(subscription))
    .filter((value): value is string => Boolean(value));
  const scheduleText =
    scheduleLabels.length > 0 ? scheduleLabels.join(", ") : "—";

  return (
    <tr
      data-testid={`notification-row-${notification.id}`}
      className={onRowClick ? CS.cursorPointer : undefined}
      onClick={onRowClick ? () => onRowClick(notification.id) : undefined}
    >
      <td onClick={(event) => event.stopPropagation()}>
        <Checkbox
          aria-label={t`Select notification ${notification.id}`}
          checked={selected}
          onChange={() => onToggle(notification.id)}
        />
      </td>
      <td>{notification.id}</td>
      <td>
        <CardCell notification={notification} isOrphaned={isOrphanedCard} />
      </td>
      <td>
        <CreatorCell notification={notification} />
      </td>
      <td>
        <Ellipsified style={{ maxWidth: 220 }} tooltip={scheduleText}>
          {scheduleText}
        </Ellipsified>
      </td>
      <td>
        <RecipientsCell
          channels={channels}
          recipientCount={recipientCount}
          handlers={handlers}
        />
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        {notification.last_sent_at ? (
          <Tooltip label={dayjs(notification.last_sent_at).fromNow()}>
            <DateTime value={notification.last_sent_at} unit="minute" />
          </Tooltip>
        ) : (
          "—"
        )}
      </td>
      <td>
        <HealthBadge health={notification.health} />
      </td>
    </tr>
  );
});

type CardCellProps = {
  notification: AdminNotificationListItem;
  isOrphaned: boolean;
};

const CardCell = ({ notification, isOrphaned }: CardCellProps) => {
  const card = notification.payload?.card;
  const cardId = notification.payload?.card_id;
  const name = card?.name ?? (cardId != null ? `#${cardId}` : t`Unknown card`);

  if (cardId != null && !isOrphaned) {
    return (
      <Ellipsified style={{ maxWidth: 260 }} tooltip={name}>
        <Link
          variant="brand"
          to={Urls.question({ id: cardId, name })}
          onClick={(event) => event.stopPropagation()}
        >
          {name}
        </Link>
      </Ellipsified>
    );
  }
  return (
    <Ellipsified style={{ maxWidth: 260 }} tooltip={name}>
      <span>{name}</span>
    </Ellipsified>
  );
};

type CreatorCellProps = {
  notification: AdminNotificationListItem;
};

const CreatorCell = ({ notification }: CreatorCellProps) => {
  const creator = notification.creator;
  const name = creator?.common_name ?? creator?.email ?? t`Unknown`;
  return (
    <Ellipsified style={{ maxWidth: 180 }} tooltip={name}>
      {name}
    </Ellipsified>
  );
};

type RecipientsCellProps = {
  channels: NotificationChannelType[];
  recipientCount: number;
  handlers: NotificationHandler[];
};

const HealthBadge = ({ health }: { health: NotificationHealth }) => (
  <Badge
    color={getHealthColor(health)}
    variant="light"
    styles={{ label: { overflow: "visible" } }}
  >
    {getHealthLabel(health)}
  </Badge>
);

const RecipientsCell = ({
  channels,
  recipientCount,
  handlers,
}: RecipientsCellProps) => {
  const tooltipLabel =
    handlers
      .map((handler) => {
        const label = getChannelLabel(handler.channel_type);
        const count = handler.recipients?.length ?? 0;
        return count > 0 ? `${label}: ${count}` : label;
      })
      .join(" · ") || undefined;

  return (
    <Tooltip label={tooltipLabel} disabled={!tooltipLabel}>
      <Group gap="xs" wrap="nowrap">
        {channels.map((channel) => (
          <Icon
            key={channel}
            name={getChannelIconName(channel)}
            aria-label={getChannelLabel(channel)}
          />
        ))}
        <span>{recipientCount}</span>
      </Group>
    </Tooltip>
  );
};
